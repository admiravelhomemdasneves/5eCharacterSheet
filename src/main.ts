import { CachedMetadata, Modal, Notice, Plugin, Setting, TFile, TFolder, Vault, normalizePath } from "obsidian";
import * as E from "./rules/engine";
import { CharState, Compendium, Rules, SheetView, newCharacter } from "./rules/engine";
import { EMPTY_DATA, RulesContext, emptyContext } from "./rules/context";
import { CharacterSheet } from "./ui/sheet";
import { Linker, NoteInfo, sourceOfTag } from "./data/links";
import { BrewEntry, HomebrewFile, IMPORT_CHANGES, buildCompendium, importOptions, importOutdated, summarize } from "./data/build";
import { SKIP_FOLDERS, detect } from "./data/detect";
import { ReportFile, importReport, joinedData, mergedEntries } from "./data/report";
import { RemovedEntry, entryKey, removedFrom, removedKeys, withoutEntries } from "./data/entries";
import { ImportReportModal } from "./ui/report";
import { DEFAULT_SETTINGS, SheetSettings, SheetSettingTab } from "./settings";
import { compendiumFor, editionsApart, importedRulesets, isMixedData } from "./data/editions";
import { dataConflicts } from "./rules/conflicts";
import { fileNameProblem, renamedPath } from "./files";
import { loadSrd } from "./data/srd";
import { DEFAULT_RULESET, emptyCustomFile, type CustomEntry, type CustomFile } from "./custom/format";
import { DEFAULT_CUSTOM_PATH, loadCustom, saveCustom } from "./custom/store";
import { mergeCustom } from "./custom/merge";
import { RULESETS, rulesetById } from "./rules/rulesets";

// Code block names: "character-sheet-5e" for new notes, "dnd-character" kept for older ones
export const BLOCKS = ["character-sheet-5e", "dnd-character"];

const TEMPLATE = (name: string, ruleset: string) => `---
obsidianUIMode: preview
cssclasses:
  - character-sheet-5e
tags:
  - character
dnd:
  name: ${JSON.stringify(name)}
  ruleset: ${JSON.stringify(ruleset)}
---

\`\`\`character-sheet-5e
\`\`\`
`;

/** local storage key of the sheets' views (see CharacterSheetPlugin#view) */
const VIEWS_KEY = "fifth-edition-character-sheet:views";
/** App#loadLocalStorage and App#saveLocalStorage, from Obsidian 1.8.7: checked at runtime for older versions */
type LocalStorageApp = { loadLocalStorage?: (key: string) => unknown; saveLocalStorage?: (key: string, data: unknown) => void };

export default class CharacterSheetPlugin extends Plugin {
  settings: SheetSettings = { ...DEFAULT_SETTINGS };
  /** what the sheets of each ruleset work with, by ruleset id */
  private contexts = new Map<string, RulesContext>(RULESETS.map((r) => [r.id, emptyContext(r.id, r, "loading")]));
  /** reloads run one after the other, so an older one can't finish last */
  private reloading: Promise<void> = Promise.resolve();
  /** the state of each sheet note opened this session, shared by all its sheets; by note path */
  states = new Map<string, CharState>();
  /** pending saves (debounced) and saves being written, by note path */
  private saveTimers = new Map<string, number>();
  private writing = new Set<string>();
  /** how each sheet note is shown (collapsed sections, edit mode), by note path: on this device, not in the notes */
  private views: Record<string, SheetView> = {};
  private importNoticeShown = false;
  private conflictNoticeShown = false;
  sheets = new Set<CharacterSheet>();
  /** the custom data file as last read */
  customFile: CustomFile = emptyCustomFile();
  /** The rules a sheet works with. Rules this version doesn't have give an unavailable context, never another ruleset's. */
  contextById(id: string): RulesContext { return this.contexts.get(id) ?? emptyContext(id, null, "unavailable"); }
  /** The context of the plugin's own pages (settings, Import data, Custom data). */
  get context() { return this.contextById(DEFAULT_RULESET); }
  customPath() { return normalizePath(this.settings.customDataPath.trim() || DEFAULT_CUSTOM_PATH); }

  async onload() {
    const saved = (await this.loadData()) as Partial<SheetSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved, splitEditions: editionsApart(saved) };
    this.views = this.loadViews();
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
  reloadData() {
    this.reloading = this.reloading.then(() => this.loadContexts(), (e) => { console.error("5e Character Sheet: could not reload the rules data", e); return this.loadContexts(); });
    return this.reloading;
  }
  private async loadContexts() {
    const custom = await loadCustom(this.app.vault.adapter, this.customPath());
    this.customFile = custom.file;
    for (const r of RULESETS) {
      // rules with nothing to load cost nothing: most vaults use one ruleset
      const idle = r.id !== DEFAULT_RULESET && this.dataSourceOf(r.id) === "none" && !custom.file.entries.some((e) => e.ruleset === r.id);
      this.contexts.set(r.id, idle ? { ...emptyContext(r.id, r, "ready"), linker: this.buildLinker({}, r.id) } : await this.loadContext(r.id, custom));
    }
    // said once per session: the rest is for when the settings are open
    if (!this.conflictNoticeShown && this.dataConflicts().some((c) => c.kind === "mixed-data")) {
      this.conflictNoticeShown = true;
      new Notice("Your imported rules data has the 2014 and 2024 rules mixed: open the plugin settings to separate them.", 15000);
    }
    this.sheets.forEach((s) => s.reload());
  }
  private async loadContext(id: string, custom: Awaited<ReturnType<typeof loadCustom>>): Promise<RulesContext> {
    let data: Compendium = EMPTY_DATA;
    const source = this.dataSourceOf(id);
    try {
      if (source === "srd") data = loadSrd(id);
      else if (source === "imported") {
        const file = this.importedFile(id);
        if (await this.app.vault.adapter.exists(file)) data = JSON.parse(await this.app.vault.adapter.read(file)) as Compendium;
        else new Notice("No imported rules data yet. Import it in the plugin settings.");
      }
    } catch (e) {
      console.error("5e Character Sheet: could not load rules data", e);
      new Notice("Could not load the rules data, so the sheets are in manual mode.");
      data = EMPTY_DATA;
    }
    // data imported by an older version of the plugin: remind the user (once per session) to import again
    const importIsOutdated = source === "imported" && data !== EMPTY_DATA && importOutdated(data.meta);
    if (importIsOutdated && !this.importNoticeShown) {
      this.importNoticeShown = true;
      new Notice(`5e Character Sheet: your imported 5etools data is from an older version of the plugin. Press "Import now" in the plugin settings to update it (${IMPORT_CHANGES}).`, 15000);
    }
    // custom entries: added to the data, or on their own for manual mode to fill its fields from
    const ruleset = rulesetById(id);
    const merged = mergeCustom(data, custom.file, ruleset), alone = mergeCustom(EMPTY_DATA, custom.file, ruleset);
    const manual = source === "none" || (data.races.length === 0 && data.classes.length === 0);
    const linker = this.buildLinker(merged.links, id);
    return {
      id, ruleset, importIsOutdated, manual, linker,
      // a source is chosen but gave nothing: the sheets must not take that for rules that say nothing
      status: source !== "none" && data === EMPTY_DATA ? "unavailable" : "ready",
      rules: new Rules(linker.attach(manual ? data : merged.data), ruleset.profile),
      baseData: data, customOnly: linker.attach(alone.data),
      customProblems: [...(custom.error ? [custom.error] : []), ...custom.warnings, ...merged.warnings], customOther: merged.other,
    };
  }

  /** Save the custom data file, then load the data again with it. */
  async saveCustomFile(file: CustomFile) {
    await saveCustom(this.app.vault.adapter, this.customPath(), file);
    await this.reloadData();
  }
  /** Add a custom entry, or replace the one with its id. */
  async saveCustomEntry(e: CustomEntry) {
    const entries = this.customFile.entries.some((x) => x.id === e.id) ? this.customFile.entries.map((x) => (x.id === e.id ? e : x)) : [...this.customFile.entries, e];
    await this.saveCustomFile({ ...this.customFile, entries });
  }
  async deleteCustomEntry(id: string) {
    await this.saveCustomFile({ ...this.customFile, entries: this.customFile.entries.filter((x) => x.id !== id) });
  }

  /** Index the compendium notes (title + source tag) under the configured folder. `extra`: notes custom entries link to, by note key. */
  buildLinker(extra: Record<string, string> = {}, ruleset = DEFAULT_RULESET) {
    const linker = this.linkerOf(extra, ruleset);
    linker.sameSourceOnly = ruleset !== DEFAULT_RULESET;
    return linker;
  }
  private linkerOf(extra: Record<string, string>, ruleset: string) {
    const root = normalizePath(compendiumFor(this.settings, ruleset) || "/");
    // notes chosen in "Import data" link even without a compendium folder
    const chosen = { ...this.settings.noteLinks, ...extra };
    if (root === "/") return new Linker(null, [], chosen);
    const notes: NoteInfo[] = [];
    // only the compendium folder is read, not the rest of the vault
    const folder = this.app.vault.getAbstractFileByPath(`${root}/compendium`);
    if (!(folder instanceof TFolder)) return new Linker(root, notes, chosen);
    Vault.recurseChildren(folder, (f) => {
      if (!(f instanceof TFile) || f.extension !== "md") return;
      const fm: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) return;
      const alias: unknown = Array.isArray(fm.aliases) ? (fm.aliases as unknown[])[0] : fm.aliases;
      const tags: unknown[] = Array.isArray(fm.tags) ? (fm.tags as unknown[]) : fm.tags ? [fm.tags] : [];
      const source = tags.map((t) => sourceOfTag(String(t))).find(Boolean);
      if ((typeof alias === "string" || typeof alias === "number") && source) notes.push({ path: f.path.replace(/\.md$/, ""), alias: String(alias), source });
    });
    return new Linker(root, notes, chosen);
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
   * Import a 5etools `data/` folder the user owns, with the homebrew files listed (either can be
   * missing). The files live inside the vault (a hidden folder such as `.5etools/data` keeps them
   * out of the file list and search), so they are read through the vault adapter and work on
   * desktop and mobile. A report of what came from where is shown at the end.
   */
  async importFiveTools() {
    const adapter = this.app.vault.adapter;
    const folder = this.settings.fivetoolsPath.trim();
    const base = folder ? normalizePath(folder) : null;
    const brewPaths = this.settings.homebrewFiles.map((p) => p.trim()).filter(Boolean);
    if (base != null && (base === "/" || !(await adapter.exists(`${base}/races.json`)))) {
      new Notice(`"${folder}" is not a 5etools "data" folder (the one that contains races.json). Correct it, or leave it empty to import only the homebrew files.`);
      return;
    }
    if (base == null && !brewPaths.length) {
      new Notice("Nothing to import: set the 5etools \"data\" folder, homebrew files, or both.");
      return;
    }
    const notice = new Notice(base ? "Importing 5etools data…" : "Importing homebrew…", 0);
    try {
      // homebrew files, and entries in them, that can't be read are left out and reported; the rest is imported
      const homebrew: HomebrewFile[] = [], files: ReportFile[] = [], leftOut: string[] = [];
      for (const path of brewPaths) {
        const file = normalizePath(path);
        try {
          if (!(await adapter.exists(file))) throw new Error("not found");
          const json = JSON.parse(await adapter.read(file)) as unknown;
          homebrew.push({ file, json });
          files.push({ file, json });
        } catch (e) {
          files.push({ file, error: (e as Error).message });
        }
      }
      const results: { data: Compendium; entries: BrewEntry[] }[] = [];
      const brew = !base ? ` (${homebrew.length} homebrew file${homebrew.length === 1 ? "" : "s"} only, no 5etools data)` : homebrew.length ? ` (with ${homebrew.length} homebrew file${homebrew.length === 1 ? "" : "s"})` : "";
      for (const ruleset of importedRulesets(this.settings)) {
        const entries: BrewEntry[] = [];
        const linker = this.settings.importOnlyWithNotes ? this.buildLinker({}, ruleset) : null;
        if (this.settings.importOnlyWithNotes && !linker?.enabled) throw new Error("No compendium notes found — set the compendium folder first, or turn off \"Only entries with a compendium note\".");
        const built = await buildCompendium({
          read: base ? async (rel) => JSON.parse(await adapter.read(normalizePath(`${base}/${rel}`))) as unknown : undefined,
          homebrew: structuredClone(homebrew),
          warn: (message) => leftOut.push(message),
          brewEntry: (e) => entries.push(e),
          ...importOptions(ruleset, this.settings),
          keep: linker ? (kind, name, source) => linker.has(kind, name, source) : undefined,
        });
        // entries removed in "Import data" stay out; the file of each homebrew entry is kept for that page
        const removed = removedKeys(removedFrom(this.settings.removedEntries, ruleset));
        const origins: Record<string, string> = {};
        for (const e of entries) {
          const key = entryKey(e.kind, e.name, e.source);
          if (e.reason == null && removed.has(key)) e.reason = "removed in Import data";
          if (e.reason == null) origins[key] = e.file;
        }
        const data = withoutEntries(built, removed);
        data.meta = { ...data.meta, origins };
        await this.writeImported(ruleset, data);
        const last = `${new Date().toLocaleString()} — ${summarize(data)}${brew}`;
        // only the rules imported change: their data source, not the one of the other rules
        if (ruleset === DEFAULT_RULESET) { this.settings.lastImport = last; this.settings.dataSource = "imported"; }
        else { this.settings.lastImport2024 = last; this.settings.dataSource2024 = "imported"; }
        results.push({ data, entries });
      }
      await this.saveSettings();
      notice.hide();
      if (leftOut.length) console.warn(`5e Character Sheet: left out of the import:\n${[...new Set(leftOut)].join("\n")}`);
      new ImportReportModal(this.app, importReport({ data: joinedData(results.map((x) => x.data)), dataFolder: base, files, entries: mergedEntries(results.map((x) => x.entries)), messages: [...new Set(leftOut)] })).open();
    } catch (e) {
      notice.hide();
      console.error("5e Character Sheet: import failed", e);
      new Notice(`Import failed: ${(e as Error).message}`, 10000);
    }
  }

  /** The imported data of some rules: one file each, so an import of one can't touch the other. */
  private importedFile(ruleset: string) { return normalizePath(`${this.manifest.dir}/data/${ruleset === DEFAULT_RULESET ? "imported" : "imported-2024"}.json`); }
  private async writeImported(ruleset: string, data: Compendium) {
    const dir = normalizePath(`${this.manifest.dir}/data`);
    if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
    await this.app.vault.adapter.write(this.importedFile(ruleset), JSON.stringify(data));
  }

  /** Remove entries from the imported data ("Import data"); they stay out of later imports until restored. */
  async removeEntries(entries: RemovedEntry[], ruleset = DEFAULT_RULESET) {
    const file = this.importedFile(ruleset);
    if (await this.app.vault.adapter.exists(file)) {
      const data = JSON.parse(await this.app.vault.adapter.read(file)) as Compendium;
      await this.writeImported(ruleset, withoutEntries(data, removedKeys(entries)));
    }
    const known = removedKeys(removedFrom(this.settings.removedEntries, ruleset));
    const stamped = entries.map((e) => (ruleset === DEFAULT_RULESET ? e : { ...e, ruleset }));
    this.settings.removedEntries = [...this.settings.removedEntries, ...stamped.filter((e) => !known.has(entryKey(e.kind, e.name, e.source)))];
    await this.saveSettings();
  }
  /** Let removed entries come back: they are in the data again after the next import. */
  async restoreEntries(entries: RemovedEntry[], ruleset = DEFAULT_RULESET) {
    const back = removedKeys(entries);
    this.settings.removedEntries = this.settings.removedEntries.filter((e) => (e.ruleset ?? DEFAULT_RULESET) !== ruleset || !back.has(entryKey(e.kind, e.name, e.source)));
    await this.saveData(this.settings);
  }
  /** The compendium note of an entry, by its note key: a note path (without .md), "" for none, or null to match by name again. */
  async setNoteLink(key: string, path: string | null) {
    const links = { ...this.settings.noteLinks };
    if (path == null) delete links[key]; else links[key] = path;
    this.settings.noteLinks = links;
    await this.saveSettings();
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
    // the views of the notes at or inside it follow too, also of notes not opened this session
    let viewsMoved = false;
    for (const [path, view] of Object.entries(this.views)) {
      const now = renamedPath(path, from, to ?? "");
      if (now == null) continue;
      delete this.views[path];
      if (to != null) this.views[now] = view;
      viewsMoved = true;
    }
    if (viewsMoved) this.saveViews();
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

  // ---------------------------------------------------------------- views
  /**
   * How a sheet note is shown on this device. `legacy`: the view an older note kept in itself
   * (E.legacyView), taken when this device has none for it yet.
   */
  view(path: string, legacy?: SheetView | null): SheetView {
    let v = this.views[path];
    if (!v) { v = legacy ?? E.emptyView(); this.views[path] = v; if (legacy) this.saveViews(); }
    return v;
  }
  /** Keep the views after a change: in the vault's local storage, with only the sheets shown other than the default. */
  saveViews() {
    const kept = Object.fromEntries(Object.entries(this.views).filter(([, v]) => Object.values(v.collapsed).some(Boolean) || Object.values(v.editing).some(Boolean)));
    // App#saveLocalStorage (Obsidian 1.8.7+) keeps it per vault; before that the views last only the session
    (this.app as LocalStorageApp).saveLocalStorage?.(VIEWS_KEY, kept);
  }
  private loadViews(): Record<string, SheetView> {
    try {
      const saved: unknown = (this.app as LocalStorageApp).loadLocalStorage?.(VIEWS_KEY);
      if (!saved || typeof saved !== "object") return {};
      return Object.fromEntries(Object.entries(saved as Record<string, Partial<SheetView>>).map(([p, v]) => [p, { collapsed: { ...v?.collapsed }, editing: { ...v?.editing } }]));
    } catch {
      return {};
    }
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
    const ctx = this.contextById(s0.ruleset), keys = E.flatKeys(ctx.rules, s0, ctx.manual, this.trusted(ctx, s0), file.basename);
    this.writing.add(path);
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm.dnd = E.savedState(s0);
        // flat keys for Dataview, Initiative Tracker (players) and Fantasy Statblocks
        Object.assign(fm, keys);
        if (s0.image) fm.image = s0.image; else delete fm.image;
        for (const k of Object.keys(fm)) if (fm[k] === undefined) delete fm[k];
      });
    } finally {
      this.writing.delete(path);
    }
  }
  /** What is wrong between the rules chosen and the data for them. */
  dataConflicts() {
    const st = this.settings;
    return dataConflicts({
      rules: RULESETS.map((r) => ({ id: r.id, label: r.label, source: this.dataSourceOf(r.id), status: this.contextById(r.id).status })),
      defaultRuleset: st.defaultRuleset, mixed: !st.splitEditions && isMixedData(this.context.baseData),
    });
  }
  /** Separate imported data with both editions in it: the data as it was is kept in a backup, then each edition is imported into its own. */
  async splitMixedImport() {
    if (!this.settings.fivetoolsPath.trim() && !this.settings.homebrewFiles.length) { new Notice("Set the 5etools \"data\" folder first, so each edition can be imported."); return; }
    const adapter = this.app.vault.adapter, file = this.importedFile(DEFAULT_RULESET);
    if (await adapter.exists(file)) await adapter.write(normalizePath(`${this.manifest.dir}/data/imported-mixed-backup.json`), await adapter.read(file));
    Object.assign(this.settings, { splitEditions: true, importRules2014: true, dataSource2024: "imported" });
    await this.importFiveTools();
  }
  /** Where the data of some rules comes from. */
  dataSourceOf(id: string) { return id === DEFAULT_RULESET ? this.settings.dataSource : this.settings.dataSource2024; }
  /** What the rules say about this state can be used: its data is there and has all it chose (see E.unresolvedIds). */
  trusted(ctx: RulesContext, s: CharState) { return ctx.status === "ready" && (ctx.manual || E.unresolvedIds(ctx.rules, s).length === 0); }
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
  freshCharacter(name: string, ruleset = this.settings.defaultRuleset): CharState {
    const s = newCharacter(name);
    s.ruleset = ruleset;
    if (this.dataSourceOf(ruleset) === "none") s.abilities = { ...s.abilities, method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
    // Sheet template: sections left out of new sheets
    for (const key of this.settings.hiddenSections) s.ui.hidden[key] = true;
    return s;
  }

  async createCharacter(name: string, folder: string, ruleset = this.settings.defaultRuleset) {
    const dir = normalizePath(folder || "/");
    if (dir !== "/" && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    const prefix = dir === "/" ? "" : dir + "/";
    let path = normalizePath(`${prefix}${name}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${prefix}${name} ${i}.md`);
    const file = await this.app.vault.create(path, TEMPLATE(name, ruleset));
    this.settings.lastFolder = dir === "/" ? "" : dir;
    await this.saveData(this.settings);
    this.states.set(file.path, this.freshCharacter(name, ruleset));
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
    let name = "", folder = this.plugin.defaultFolder(), ruleset = this.plugin.settings.defaultRuleset;
    new Setting(contentEl).setName("Name").addText((t) => { t.setPlaceholder("Character name").onChange((v) => (name = v)); window.setTimeout(() => t.inputEl.focus(), 50); });
    new Setting(contentEl).setName("Folder").setDesc("Where the character note is created (empty = vault root)").addText((t) => t.setPlaceholder("/").setValue(folder).onChange((v) => (folder = v)));
    const rules = new Setting(contentEl).setName("Rules");
    const hint = () => rules.setDesc(this.plugin.dataSourceOf(ruleset) === "none" ? "These rules have no rules data, so the sheet starts in manual mode." : "");
    rules.addDropdown((d) => d.addOptions(Object.fromEntries(RULESETS.map((r) => [r.id, r.label]))).setValue(ruleset).onChange((v) => { ruleset = v; hint(); }));
    hint();
    new Setting(contentEl).addButton((b) => b.setButtonText("Create").setCta().onClick(async () => {
      if (!name.trim()) { new Notice("Give the character a name."); return; }
      // the name is the note's file name; the folder may have subfolders, each checked the same way
      const nameProblem = fileNameProblem(name.trim());
      if (nameProblem) { new Notice(`${nameProblem}, as it is the note's file name.`); return; }
      const folderProblem = folder.trim().split("/").filter(Boolean).map(fileNameProblem).find(Boolean);
      if (folderProblem) { new Notice(`Folder: ${folderProblem.replace(/^A name/, "a folder name")}.`); return; }
      this.close();
      try {
        await this.plugin.createCharacter(name.trim(), folder.trim(), ruleset);
      } catch (e) {
        console.error("5e Character Sheet: could not create the character", e);
        new Notice(`Could not create the character: ${(e as Error).message}`);
      }
    }));
  }
  onClose() { this.contentEl.empty(); }
}
