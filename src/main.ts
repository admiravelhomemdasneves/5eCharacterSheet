import { Modal, Notice, Plugin, Setting, normalizePath } from "obsidian";
import { CharState, Compendium, Rules, newCharacter } from "./rules/engine";
import { CharacterSheet } from "./ui/sheet";
import { Linker, NoteInfo } from "./data/links";
import { buildCompendium, summarize } from "./data/build";
import { DEFAULT_SETTINGS, SheetSettings, SheetSettingTab } from "./settings";
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
  states = new Map<string, CharState>();
  sheets = new Set<CharacterSheet>();
  /** manual mode: no rules data configured (or the configured data could not be loaded) */
  get manual() { return this.rules.data.races.length === 0 && this.rules.data.classes.length === 0; }

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) || {}) };
    this.addSettingTab(new SheetSettingTab(this.app, this));

    for (const lang of BLOCKS) {
      this.registerMarkdownCodeBlockProcessor(lang, (_src, el, ctx) => {
        ctx.addChild(new CharacterSheet(this, el, ctx.sourcePath));
      });
    }
    this.addCommand({ id: "new-character", name: "New character", callback: () => new NewCharacterModal(this).open() });
    this.addRibbonIcon("scroll-text", "New character sheet", () => new NewCharacterModal(this).open());

    // keep the in-memory cache in sync when a sheet note is renamed or deleted
    this.registerEvent(this.app.vault.on("rename", (f, old) => { const s = this.states.get(old); if (s) { this.states.delete(old); this.states.set(f.path, s); } }));
    this.registerEvent(this.app.vault.on("delete", (f) => this.states.delete(f.path)));

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
        if (await this.app.vault.adapter.exists(file)) data = JSON.parse(await this.app.vault.adapter.read(file));
        else new Notice("5e Character Sheet: no imported data yet — import it in the plugin settings.");
      }
    } catch (e) {
      console.error("5e Character Sheet: could not load rules data", e);
      new Notice("5e Character Sheet: could not load the rules data; sheets are in manual mode.");
      data = EMPTY;
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
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(`${root}/compendium/`)) continue;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) continue;
      const alias = Array.isArray(fm.aliases) ? fm.aliases[0] : fm.aliases;
      const tags: string[] = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];
      const source = tags.map((t) => String(t).match(/compendium\/src\/5e\/([a-z0-9-]+)/)?.[1]).find(Boolean);
      if (alias && source) notes.push({ path: f.path.replace(/\.md$/, ""), alias: String(alias), source });
    }
    return new Linker(root, notes);
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
      const data = await buildCompendium({
        read: async (rel) => JSON.parse(await adapter.read(normalizePath(`${base}/${rel}`))),
        rules2014Only: this.settings.importRules2014 && !this.settings.importOnlyWithNotes,
        keep: linker ? (kind, name, source) => linker.has(kind, name, source) : undefined,
      });
      const dir = normalizePath(`${this.manifest.dir}/data`);
      if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
      await this.app.vault.adapter.write(`${dir}/imported.json`, JSON.stringify(data));
      this.settings.lastImport = `${new Date().toLocaleString()} — ${summarize(data)}`;
      this.settings.dataSource = "imported";
      await this.saveSettings();
      notice.hide();
      new Notice(`Imported: ${summarize(data)}`, 8000);
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

  // ---------------------------------------------------------------- characters
  /** Folder suggested for a new character: the configured one, else the last used one, else the vault root. */
  defaultFolder() { return this.settings.charactersFolder.trim() || this.settings.lastFolder || ""; }

  async createCharacter(name: string, folder: string) {
    const dir = normalizePath(folder || "/");
    if (dir !== "/" && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    const prefix = dir === "/" ? "" : dir + "/";
    let path = normalizePath(`${prefix}${name}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${prefix}${name} ${i}.md`);
    const file = await this.app.vault.create(path, TEMPLATE(name));
    this.settings.lastFolder = dir === "/" ? "" : dir;
    await this.saveData(this.settings);
    this.states.set(file.path, { ...newCharacter(name) });
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
