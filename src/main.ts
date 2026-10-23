import { CachedMetadata, Modal, Notice, Plugin, Setting, TFile, TFolder, Vault, normalizePath } from "obsidian";
import * as E from "./rules/engine";
import { CharState, Compendium, Rules, newCharacter } from "./rules/engine";
import { CharacterSheet } from "./ui/sheet";
import { Linker, NoteInfo, sourceOfTag } from "./data/links";
import { HomebrewFile, IMPORT_CHANGES, buildCompendium, importOutdated, summarize } from "./data/build";
import { SKIP_FOLDERS, detect } from "./data/detect";
import { DEFAULT_SETTINGS, SheetSettings, SheetSettingTab } from "./settings";
import { renamedPath } from "./files";
import srdData from "../data/srd-5.1.json";

// Code block names: "character-sheet-5e" for new notes, "dnd-character" kept for older ones
export const BLOCKS = ["character-sheet-5e", "dnd-character"];

const TEMPLATE = (name: string) => `---
obsidianUIMode: preview
cssclasses:
  - character-sheet-5e
tags:
  - character
dnd:
  name: ${JSON.stringify(name)}
---

\`\`\`character-sheet-5e
\`\`\`
`;

const EMPTY: Compendium = { meta: { sources: {} }, races: [], classes: [], backgrounds: [], feats: [], spells: [], items: [] };

export default class CharacterSheetPlugin extends Plugin {
  settings: SheetSettings = { ...DEFAULT_SETTINGS };
  rules: Rules = new Rules(EMPTY);
  linker: Linker = new Linker(null, []);
  /** the state of each sheet note opened this session, shared by all its sheets; by note path */
  states = new Map<string, CharState>();
  /** pending saves (debounced) and saves being written, by note path */
  private saveTimers = new Map<string, number>();
  private writing = new Set<string>();
  /** the imported rules data was made by an older importer and should be imported again */
  importIsOutdated = false;
  private importNoticeShown = false;
  sheets = new Set<CharacterSheet>();
  /** manual mode: no rules data configured (or the configured data could not be loaded) */
  get manual() { return this.rules.data.races.length === 0 && this.rules.data.classes.length === 0; }

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<SheetSettings> | null) };
    this.addSettingTab(new SheetSettingTab(this.app, this));

    for (const lang of BLOCKS) {
      this.registerMarkdownCodeBlockProcessor(lang, (_src, el, ctx) => {
        ctx.addChild(new CharacterSheet(this, el, ctx.sourcePath));
      });
    }
    this.addCommand({ id: "new-character", name: "New character", callback: () => new NewCharacterModal(this).open() });
    this.addRibbonIcon("scroll-text", "New character sheet", () => new NewCharacterModal(this).open());

    // keep the states, pending saves and open sheets in step when a sheet note, or a folder it is in,
    // is renamed, moved or deleted
    this.registerEvent(this.app.vault.on("rename", (f, old) => this.moved(old, f.path)));
    this.registerEvent(this.app.vault.on("delete", (f) => this.moved(f.path, null)));
    // the note was changed outside the sheet (properties, sync, another plugin): show that
    this.registerEvent(this.app.metadataCache.on("changed", (f, _data, cache) => this.externalChange(f, cache)));

    // data and compendium links need the metadata cache, which is ready after layout
    this.app.workspace.onLayoutReady(() => this.reloadData());
  }

  // ---------------------------------------------------------------- data
  async reloadData() {
    let data: Compendium = EMPTY;
    try {
      if (this.settings.dataSource === "srd") data = structuredClone(srdData as unknown as Compendium);
      else if (this.settings.dataSource === "imported") {
        const file = normalizePath(`${this.manifest.dir}/data/imported.json`);
        if (await this.app.vault.adapter.exists(file)) data = JSON.parse(await this.app.vault.adapter.read(file)) as Compendium;
        else new Notice("No imported rules data yet. Import it in the plugin settings.");
      }
    } catch (e) {
      console.error("5e Character Sheet: could not load rules data", e);
      new Notice("Could not load the rules data, so the sheets are in manual mode.");
      data = EMPTY;
    }
    // data imported by an older version of the plugin: remind the user (once per session) to import again
    this.importIsOutdated = this.settings.dataSource === "imported" && data !== EMPTY && importOutdated(data.meta);
    if (this.importIsOutdated && !this.importNoticeShown) {
      this.importNoticeShown = true;
      new Notice(`5e Character Sheet: your imported 5etools data is from an older version of the plugin. Press "Import now" in the plugin settings to update it (${IMPORT_CHANGES}).`, 15000);
    }
    this.linker = this.buildLinker();
    this.rules = new Rules(this.linker.attach(data));
    this.sheets.forEach((s) => s.reload());
  }

  /** Index the compendium notes (title + source tag) under the configured folder. */
  buildLinker() {
    const root = normalizePath(this.settings.compendiumFolder.trim() || "/");
    if (root === "/") return new Linker(null, []);
    const notes: NoteInfo[] = [];
    // only the compendium folder is read, not the rest of the vault
    const folder = this.app.vault.getAbstractFileByPath(`${root}/compendium`);
    if (!(folder instanceof TFolder)) return new Linker(root, notes);
    Vault.recurseChildren(folder, (f) => {
      if (!(f instanceof TFile) || f.extension !== "md") return;
      const fm: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) return;
      const alias: unknown = Array.isArray(fm.aliases) ? (fm.aliases as unknown[])[0] : fm.aliases;
      const tags: unknown[] = Array.isArray(fm.tags) ? (fm.tags as unknown[]) : fm.tags ? [fm.tags] : [];
      const source = tags.map((t) => sourceOfTag(String(t))).find(Boolean);
      if ((typeof alias === "string" || typeof alias === "number") && source) notes.push({ path: f.path.replace(/\.md$/, ""), alias: String(alias), source });
    });
    return new Linker(root, notes);
  }

  /**
   * Look through the vault for 5etools data, 5etools homebrew and a compendium ("Detect" in the
   * settings). Read through the adapter, so hidden folders such as `.5etools` are found too.
   */
  async detectFiveTools() {
    const adapter = this.app.vault.adapter;
    const notice = new Notice("Looking for 5etools data in this vault…", 0);
    try {
      return await detect({
        list: (dir) => adapter.list(normalizePath(dir || "/")),
        read: (path) => adapter.read(path),
        size: async (path) => (await adapter.stat(path))?.size ?? null,
      }, { skip: [this.app.vault.configDir, ...SKIP_FOLDERS] });
    } finally {
      notice.hide();
    }
  }

  /**
   * Import a 5etools `data/` folder the user owns. The folder lives inside the vault (a hidden
   * folder such as `.5etools/data` keeps it out of the file list and search), so it is read
   * through the vault adapter and works on desktop and mobile.
   */
  async importFiveTools() {
    const adapter = this.app.vault.adapter;
    const base = normalizePath(this.settings.fivetoolsPath.trim() || "/");
    if (base === "/" || !(await adapter.exists(`${base}/races.json`))) {
      new Notice("Set the 5etools \"data\" folder (inside this vault, the one that contains races.json).");
      return;
    }
    const notice = new Notice("Importing 5etools data…", 0);
    try {
      const linker = this.settings.importOnlyWithNotes ? this.buildLinker() : null;
      if (this.settings.importOnlyWithNotes && !linker?.enabled) throw new Error("No compendium notes found — set the compendium folder first, or turn off \"Only entries with a compendium note\".");
      // homebrew files, and entries in them, that can't be read are left out and reported; the rest is imported
      const homebrew: HomebrewFile[] = [], leftOut: string[] = [];
      for (const path of this.settings.homebrewFiles) {
        const file = normalizePath(path);
        try {
          if (!(await adapter.exists(file))) throw new Error("not found");
          homebrew.push({ file, json: JSON.parse(await adapter.read(file)) as unknown });
        } catch (e) {
          leftOut.push(`${file}: ${(e as Error).message}`);
        }
      }
      const data = await buildCompendium({
        read: async (rel) => JSON.parse(await adapter.read(normalizePath(`${base}/${rel}`))) as unknown,
        homebrew,
        warn: (message) => leftOut.push(message),
        rules2014Only: this.settings.importRules2014 && !this.settings.importOnlyWithNotes,
        keep: linker ? (kind, name, source) => linker.has(kind, name, source) : undefined,
      });
      const dir = normalizePath(`${this.manifest.dir}/data`);
      if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
      await this.app.vault.adapter.write(`${dir}/imported.json`, JSON.stringify(data));
      const brew = homebrew.length ? ` (with ${homebrew.length} homebrew file${homebrew.length > 1 ? "s" : ""})` : "";
      this.settings.lastImport = `${new Date().toLocaleString()} — ${summarize(data)}${brew}`;
      this.settings.dataSource = "imported";
      await this.saveSettings();
      notice.hide();
      new Notice(`Imported${brew}: ${summarize(data)}`, 8000);
      if (leftOut.length) {
        console.warn(`5e Character Sheet: left out of the import:\n${leftOut.join("\n")}`);
        const more = leftOut.length > 3 ? `\n…and ${leftOut.length - 3} more (see the developer console).` : "";
        new Notice(`Left out of the import:\n${leftOut.slice(0, 3).join("\n")}${more}`, 20000);
      }
    } catch (e) {
      notice.hide();
      console.error("5e Character Sheet: import failed", e);
      new Notice(`Import failed: ${(e as Error).message}`, 10000);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    await this.reloadData();
  }

  /** Re-render the open sheets without reloading the rules data (e.g. after a theme change). */
  refreshSheets() { this.sheets.forEach((s) => s.reload()); }
  /** Re-render the open sheets of one note, except `except` (the sheet that made the change). */
  reloadSheets(path: string, except?: CharacterSheet) { this.sheets.forEach((s) => { if (s !== except && s.sourcePath === path) s.reload(); }); }

  /** The file or folder at `from` is now at `to` (null: deleted); what was at or inside it follows. */
  private moved(from: string, to: string | null) {
    for (const [path, s] of [...this.states]) {
      const now = renamedPath(path, from, to ?? "");
      if (now == null) continue;
      this.states.delete(path);
      if (to != null) this.states.set(now, s);
      // a pending save is written at the new path, or dropped with the note
      if (this.saveTimers.has(path)) {
        window.clearTimeout(this.saveTimers.get(path)); this.saveTimers.delete(path);
        if (to != null) this.requestSave(now);
      }
    }
    if (to == null) return;
    // open sheets save to, and resolve links from, the note's new path, and show the state kept for it
    // (a sheet Obsidian made for the new path before this ran may have read its own)
    for (const s of this.sheets) {
      const now = renamedPath(s.sourcePath, from, to);
      if (now != null) { s.sourcePath = now; s.reload(); }
    }
  }

  onunload() {
    // write what is still waiting to be saved
    for (const [path, timer] of this.saveTimers) { window.clearTimeout(timer); void this.writeState(path); }
    this.saveTimers.clear();
  }

  // ---------------------------------------------------------------- saving sheets
  /** Save a note's state soon: changes within half a second are written together. */
  requestSave(path: string) {
    window.clearTimeout(this.saveTimers.get(path));
    this.saveTimers.set(path, window.setTimeout(() => { this.saveTimers.delete(path); void this.writeState(path); }, 500));
  }
  /** Write a note's state into its frontmatter, with the flat keys other plugins read. */
  private async writeState(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path), s0 = this.states.get(path);
    if (!(file instanceof TFile) || !s0) return;
    const r = this.rules, man = this.manual;
    const s = man ? E.manualView(s0) : s0;
    const sc = E.abilityScores(r, s);
    this.writing.add(path);
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm.dnd = JSON.parse(JSON.stringify(s0)) as CharState;
        // flat keys for Dataview, Initiative Tracker (players) and Fantasy Statblocks
        fm.name = s.name || file.basename;
        fm.player = s.player || undefined;
        fm.race = (man ? [s0.manual.race, s0.manual.subrace] : [r.race(s)?.name, r.subrace(s)?.name]).filter(Boolean).join(" ") || undefined;
        fm.class = (man ? s0.manual.classes.map((c) => `${c.name || "?"} ${c.level}`) : s.classes.map((e) => `${r.cls(e.id)?.name ?? "?"} ${e.level}`)).join(" / ") || undefined;
        fm.level = E.totalLevel(s);
        fm.hp = man ? s0.manual.maxHp : E.hpBreakdown(r, s, sc).max;
        fm.ac = man ? s0.manual.ac : E.armorClass(r, s, sc).value;
        fm.modifier = E.initiative(r, s, sc);
        fm.stats = E.ABILITIES.map((a) => sc[a].total);
        if (s0.image) fm.image = s0.image; else delete fm.image;
        for (const k of Object.keys(fm)) if (fm[k] === undefined) delete fm[k];
      });
    } finally {
      this.writing.delete(path);
    }
  }
  /**
   * A sheet note's frontmatter changed: when its `dnd` is no longer the state the sheets hold, it was
   * edited outside them, so that becomes the state. Changes not yet written win (they are saved over it).
   */
  private externalChange(file: TFile, cache: CachedMetadata) {
    const cur = this.states.get(file.path);
    if (!cur || this.saveTimers.has(file.path) || this.writing.has(file.path)) return;
    const dnd: unknown = cache.frontmatter?.dnd;
    if (!dnd || typeof dnd !== "object") return;
    const next = E.normalize(dnd);
    if (E.sameState(next, cur)) return;
    this.states.set(file.path, next);
    this.reloadSheets(file.path);
  }

  // ---------------------------------------------------------------- characters
  /** Folder suggested for a new character: the configured one, else the last used one, else the vault root. */
  defaultFolder() { return this.settings.charactersFolder.trim() || this.settings.lastFolder || ""; }

  /** A new character. Without rules data there are no racial or ASI bonuses to add on top of point
   *  buy, so manual mode starts with the Manual method (scores typed in, 1–30). The setting is read
   *  instead of `manual` because the rules data may not be loaded yet when a sheet first renders. */
  freshCharacter(name: string): CharState {
    const s = newCharacter(name);
    if (this.settings.dataSource === "none") s.abilities = { ...s.abilities, method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
    // Sheet template: sections left out of new sheets
    for (const key of this.settings.hiddenSections) s.ui.hidden[key] = true;
    return s;
  }

  async createCharacter(name: string, folder: string) {
    const dir = normalizePath(folder || "/");
    if (dir !== "/" && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    const prefix = dir === "/" ? "" : dir + "/";
    let path = normalizePath(`${prefix}${name}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${prefix}${name} ${i}.md`);
    const file = await this.app.vault.create(path, TEMPLATE(name));
    this.settings.lastFolder = dir === "/" ? "" : dir;
    await this.saveData(this.settings);
    this.states.set(file.path, this.freshCharacter(name));
    // written soon, so the note gets the full state (and its frontmatter is not read as a change)
    this.requestSave(file.path);
    await this.app.workspace.getLeaf(true).openFile(file);
  }
}

class NewCharacterModal extends Modal {
  constructor(private plugin: CharacterSheetPlugin) { super(plugin.app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "New character" });
    let name = "", folder = this.plugin.defaultFolder();
    new Setting(contentEl).setName("Name").addText((t) => { t.setPlaceholder("Character name").onChange((v) => (name = v)); window.setTimeout(() => t.inputEl.focus(), 50); });
    new Setting(contentEl).setName("Folder").setDesc("Where the character note is created (empty = vault root)").addText((t) => t.setPlaceholder("/").setValue(folder).onChange((v) => (folder = v)));
    new Setting(contentEl).addButton((b) => b.setButtonText("Create").setCta().onClick(async () => {
      if (!name.trim()) { new Notice("Give the character a name."); return; }
      this.close();
      await this.plugin.createCharacter(name.trim(), folder.trim());
    }));
  }
  onClose() { this.contentEl.empty(); }
}
