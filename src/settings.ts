import * as obsidian from "obsidian";
import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type CharacterSheetPlugin from "./main";
import { SRD_ATTRIBUTION } from "./data/srd";
import { SECTIONS } from "./sections";
import { IMPORT_CHANGES } from "./data/build";
import type { RemovedEntry } from "./data/entries";
import { DetectModal } from "./ui/detect";
import { ImportDataView } from "./ui/import-data";

export interface SheetSettings {
  /** optional fixed folder for new characters; empty = last used folder (vault root the first time) */
  charactersFolder: string;
  lastFolder: string;
  /** none = manual mode (type everything in), srd = bundled SRD 5.1, imported = user's own 5etools data */
  dataSource: "none" | "srd" | "imported";
  /** optional folder of a ttrpg-convert-cli compendium, used only for links */
  compendiumFolder: string;
  fivetoolsPath: string;
  /** vault paths of 5etools homebrew files added to the data when importing */
  homebrewFiles: string[];
  importRules2014: boolean;
  importOnlyWithNotes: boolean;
  lastImport: string;
  /** entries removed from the imported data ("Import data"), kept out of later imports too */
  removedEntries: RemovedEntry[];
  /** compendium notes chosen for entries ("Import data"), by note key; "" = no note */
  noteLinks: Record<string, string>;
  /** plugin =the sheet's own accent colour, obsidian = the active theme's accent, custom = customAccent */
  theme: "plugin" | "obsidian" | "custom";
  customAccent: string;
  /** sections left out of new sheets (Sheet template); empty = all sections */
  hiddenSections: string[];
}
export const DEFAULT_SETTINGS: SheetSettings = {
  charactersFolder: "", lastFolder: "", dataSource: "none", compendiumFolder: "",
  fivetoolsPath: "", homebrewFiles: [], importRules2014: true, importOnlyWithNotes: false, lastImport: "", removedEntries: [], noteLinks: {},
  theme: "plugin", customAccent: "#922610", hiddenSections: [],
};
const THEME_KEYS = ["theme", "customAccent"];
// Sheet template toggles use "section:<key>" control keys, stored as the list of hidden sections
const SECTION_PREFIX = "section:";
// homebrew files are edited one path per line and stored as a list
const HOMEBREW_PLACEHOLDER = ".5etools/homebrew/My Book.json";
const pathLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

// Texts shared by both settings UIs below
const T = {
  charactersFolder: ["Characters folder", "Optional. Folder suggested for new characters. Leave empty to use the last folder you created a character in (the vault root the first time)."],
  dataSource: ["Rules data", "Without rules data the sheet works in manual mode: you type races, classes, features, spells and values yourself, and only simple maths (modifiers, proficiency, saves, skills and spellcasting) is automatic."],
  detect: ["Detect", "Look through this vault, hidden folders included, for a 5etools data folder, 5etools homebrew files and a compendium folder. You choose what to use; nothing is read until you press the button."],
  fivetoolsPath: ["Folder with 5etools data", "Used by the import. A folder inside this vault with the data files of a 5etools copy you are entitled to use (it contains races.json). A hidden folder such as .5etools/data keeps them out of your file list and search. Leave it empty to import only homebrew."],
  homebrew: ["Homebrew files", "Optional. Homebrew in the 5etools format (JSON files inside this vault), one path per line. Their races, classes, subclasses, backgrounds, feats, spells and items are added to the 5etools data when importing, or imported on their own without a data folder."],
  rules2014: ["Only 2014 rules", "Leave out the 2024 core rulebooks and other 2024-edition entries when importing."],
  onlyNotes: ["Only entries with a note", "Import only what has a note in your compendium folder, so the menus match it exactly. Overrides the option above."],
  importNow: ["Import", "Convert the data now. The result is stored in this plugin's folder, and a report shows what came from each file."],
  compendium: ["Compendium folder", "Optional, only for links. The folder that contains the \"compendium\" and \"rules\" folders of your compendium notes. Races, classes, spells, items and features then link to their notes."],
  license: ["SRD license", ""],
  theme: ["Theme", "Accent colour of the sheets: the plugin's own, the one of your Obsidian theme, or your own choice."],
  accent: ["Accent colour", "Used for the name, section titles, lines and rollable values, in both light and dark mode."],
  template: "Sections shown in new character sheets, even while empty. Existing sheets keep their own choice: hide a section with the button next to its title, and show it again from the \"Hidden sections\" menu at the top of the sheet.",
  // pages, and the steps of the import
  general: "Where new characters are created and how the sheets look.",
  rules: "Where races, classes, spells and items come from: typed in by you (manual mode), the SRD 5.1 included with the plugin, or your own 5etools data.",
  importData: "What was imported and from where. Remove entries, and open or change their compendium notes.",
  compendiumPage: "Optional. Links from the sheets to the notes of a compendium, with page previews.",
  step1: ["Step 1: Get the data", "What you need", "The \"data\" folder of a 5etools copy: JSON files with the races, classes, spells and items of the books. Use only content you are entitled to use; the plugin downloads nothing."],
  step2: ["Step 2: Put it in your vault", "Where to put it", "Copy that folder into this vault. A hidden folder such as .5etools/data keeps its files out of your file list and search. Then press Detect, or fill in the paths below."],
  step3: "Step 3: Import",
  makeCompendium: "The compendium notes are made from your 5etools data by ttrpg-convert-cli, a separate tool.",
  more: "Read more",
} as const;

const README = "https://github.com/admiravelhomemdasneves/5eCharacterSheet";
const TUTORIALS = "https://obsidianttrpgtutorials.com/Obsidian+TTRPG+Tutorials/Plugin+Tutorials/Community+Plugins/TTRPG-Convert-CLI";
type Link = readonly [label: string, href: string];
const L = {
  general: ["Settings in the README", `${README}#settings`],
  rules: ["Rules data in the README", `${README}#rules-data`],
  guide: ["Step-by-step guide", `${README}#setting-up-5etools-data-step-by-step`],
  homebrew: ["Homebrew in the README", `${README}#homebrew`],
  homebrewRepo: ["5etools homebrew repository", "https://github.com/TheGiddyLimit/homebrew"],
  compendium: ["Compendium links in the README", `${README}#compendium-links-optional`],
  convert: ["ttrpg-convert-cli", "https://github.com/ebullient/ttrpg-convert-cli"],
  convertCli: ["Command-line tutorial", `${TUTORIALS}/TTRPG-Convert-CLI+5e`],
  convertUi: ["App tutorial", `${TUTORIALS}/TTRPG-Convert-CLI-UI`],
} as const satisfies Record<string, Link>;
/** A description followed by links, for both settings UIs (setDesc and `desc` take a fragment). */
function withLinks(text: string, ...links: Link[]) {
  return createFragment((f) => {
    if (text) f.createSpan({ text });
    links.forEach(([label, href], i) => { if (text || i) f.createSpan({ text: i ? " · " : " " }); f.createEl("a", { text: label, href }); });
  });
}
const SOURCE_OPTIONS: Record<SheetSettings["dataSource"], string> = { none: "None (manual mode)", srd: "SRD 5.1 (included)", imported: "Imported from 5etools" };
const THEME_OPTIONS: Record<SheetSettings["theme"], string> = { plugin: "Original", obsidian: "Obsidian theme", custom: "Custom" };
const attribution = SRD_ATTRIBUTION;

/**
 * The parts of the declarative settings (Obsidian 1.13) that the settings for older versions are
 * built from: getSettingDefinitions() returns plain objects of this shape, read here without the
 * 1.13 types. `value`: a definition's value, or a function giving it (`visible`, `status`).
 */
type Value<T> = T | (() => T);
interface Def {
  type?: "page" | "group" | "list"; name?: string; heading?: string; desc?: string | DocumentFragment;
  visible?: Value<boolean>; status?: Value<"warning" | null>; items?: Def[];
  control?: { type: string; key: string; options?: Record<string, string>; placeholder?: string; rows?: number };
  render?: (setting: Setting, group: never) => void; action?: (el: HTMLElement, index: number) => void;
  /** not Obsidian's: a page drawn by hand (see drawnPage) */
  draw?: (el: HTMLElement) => void;
}

/** What a page drawn by hand needs: `draw` fills an element, `redraw` is set by the page that shows it. */
interface DrawnView { draw(el: HTMLElement): void; redraw: () => void }
/**
 * A settings page drawn by hand rather than from definitions: from Obsidian 1.13 a SettingPage (the
 * class is only used when the page opens, as older versions have none), before that `draw`.
 */
function drawnPage(o: { name: string; desc: string; visible: () => boolean; view: () => DrawnView }): SettingDefinitionItem {
  const show = (view: DrawnView, el: HTMLElement) => { view.redraw = () => view.draw(el); view.draw(el); };
  const def: Def & { page: () => object } = {
    type: "page", name: o.name, desc: o.desc, visible: o.visible,
    // called by Obsidian 1.13+ only, where SettingPage exists
    page: () => {
      const Base = (obsidian as unknown as { SettingPage: new () => { containerEl: HTMLElement; title: string } }).SettingPage;
      const view = o.view();
      class Page extends Base { display() { show(view, this.containerEl); } }
      const page = new Page();
      page.title = o.name;
      return page;
    },
    draw: (el) => show(o.view(), el),
  };
  return def as unknown as SettingDefinitionItem;
}
const valueOf = <T>(v: Value<T> | undefined) => (typeof v === "function" ? (v as () => T)() : v);
const shown = (d: Def) => valueOf(d.visible) !== false;
/** which items of a page are shown, to tell when a change shows or hides some */
const visibleKeys = (items: Def[]): unknown[] => items.map((d) => (shown(d) ? (d.items ? visibleKeys(d.items) : 1) : 0));
const text = (v: unknown) => (typeof v === "string" ? v : "");

export class SheetSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CharacterSheetPlugin) { super(app, plugin); }

  private importStatus() {
    const st = this.plugin.settings;
    if (!st.lastImport) return "Not imported yet.";
    return `Last import: ${st.lastImport}` + (this.plugin.importIsOutdated ? ` — out of date: press "Import now" to update it (${IMPORT_CHANGES}).` : "");
  }

  // Obsidian 1.13+: declarative settings, also searchable from the settings search
  /** the imported data is chosen but missing or out of date */
  private importNeedsAttention() { const st = this.plugin.settings; return st.dataSource === "imported" && (!st.lastImport || this.plugin.importIsOutdated); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const st = this.plugin.settings;
    const custom = () => st.theme === "custom", imported = () => st.dataSource === "imported";
    return [
      { type: "page", name: "General", desc: T.general, items: [
        { type: "group", heading: "Characters", items: [
          { name: T.charactersFolder[0], desc: T.charactersFolder[1], control: { type: "folder", key: "charactersFolder", placeholder: "Last used folder", includeRoot: true } },
        ] },
        { type: "group", heading: "Theme", items: [
          { name: T.theme[0], desc: T.theme[1], control: { type: "dropdown", key: "theme", options: THEME_OPTIONS } },
          { name: T.accent[0], desc: T.accent[1], visible: custom, control: { type: "color", key: "customAccent" } },
        ] },
        { type: "group", items: [{ name: T.more, desc: withLinks("", L.general) }] },
      ] },
      { type: "page", name: "Sheet template", desc: T.template, items: [
        { type: "group", items: SECTIONS.map((sec) => ({ name: sec.label, control: { type: "toggle" as const, key: SECTION_PREFIX + sec.key } })) },
      ] },
      { type: "page", name: "Rules data", desc: T.rules, status: () => (this.importNeedsAttention() ? "warning" : null), items: [
        { type: "group", items: [
          { name: T.dataSource[0], desc: withLinks(T.dataSource[1], L.rules), control: { type: "dropdown", key: "dataSource", options: SOURCE_OPTIONS } },
          { name: T.license[0], desc: attribution },
        ] },
        { type: "group", heading: T.step1[0], visible: imported, items: [
          { name: T.step1[1], desc: withLinks(T.step1[2], L.guide) },
        ] },
        { type: "group", heading: T.step2[0], visible: imported, items: [
          { name: T.step2[1], desc: T.step2[2] },
          { name: T.detect[0], desc: T.detect[1], render: (setting) => { setting.addButton((b) => b.setButtonText("Detect").onClick(() => this.openDetect())); } },
          { name: T.fivetoolsPath[0], desc: T.fivetoolsPath[1], control: { type: "text", key: "fivetoolsPath", placeholder: ".5etools/data" } },
          { name: T.homebrew[0], desc: withLinks(T.homebrew[1], L.homebrew, L.homebrewRepo), control: { type: "textarea", key: "homebrewFiles", placeholder: HOMEBREW_PLACEHOLDER, rows: 4 } },
        ] },
        { type: "group", heading: T.step3, visible: imported, items: [
          { name: T.rules2014[0], desc: T.rules2014[1], control: { type: "toggle", key: "importRules2014" } },
          { name: T.onlyNotes[0], desc: T.onlyNotes[1], control: { type: "toggle", key: "importOnlyWithNotes" } },
          {
            name: T.importNow[0], desc: T.importNow[1],
            render: (setting) => {
              setting.setDesc(this.importStatus());
              setting.addButton((b) => b.setButtonText("Import now").setCta().onClick(async () => {
                await this.plugin.importFiveTools();
                setting.setDesc(this.importStatus());
                this.redraw();
              }));
            },
          },
        ] },
      ] },
      drawnPage({ name: "Import data", desc: T.importData, visible: imported, view: () => new ImportDataView(this.plugin) }),
      { type: "page", name: "Compendium", desc: T.compendiumPage, items: [
        { type: "group", items: [
          { name: T.compendium[0], desc: withLinks(T.compendium[1], L.compendium), control: { type: "folder", key: "compendiumFolder", placeholder: "Compendium" } },
          { name: "Making a compendium", desc: withLinks(T.makeCompendium, L.convert, L.convertCli, L.convertUi) },
        ] },
      ] },
    ];
  }
  getControlValue(key: string): unknown {
    if (key.startsWith(SECTION_PREFIX)) return !this.plugin.settings.hiddenSections.includes(key.slice(SECTION_PREFIX.length));
    if (key === "homebrewFiles") return this.plugin.settings.homebrewFiles.join("\n");
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }
  async setControlValue(key: string, value: unknown) {
    if (key.startsWith(SECTION_PREFIX)) { await this.setSectionShown(key.slice(SECTION_PREFIX.length), !!value); return; }
    if (key === "homebrewFiles") value = pathLines(typeof value === "string" ? value : "");
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    // these two change what the sheets show, so reload the rules data and links
    if (key === "dataSource" || key === "compendiumFolder") await this.plugin.saveSettings();
    else await this.plugin.saveData(this.plugin.settings);
    // theme changes only restyle the open sheets; the theme choice also shows or hides the custom fields
    if (THEME_KEYS.includes(key)) this.plugin.refreshSheets();
    // refreshDomState (Obsidian 1.13+) re-evaluates the `visible` predicates (the custom colour, the
    // import steps); checked at runtime for older versions
    if (key === "theme" || key === "dataSource") (this as { refreshDomState?: () => void }).refreshDomState?.();
  }

  /** "Detect": scan the vault, then show what was found; the tab is redrawn with the choices made */
  private async openDetect() {
    const found = await this.plugin.detectFiveTools();
    new DetectModal(this.plugin, found, () => this.redraw()).open();
  }
  /** Show the settings again after a change made outside them: update() from Obsidian 1.13, else build(). */
  private redraw() {
    const tab = this as { update?: () => void };
    if (tab.update) tab.update(); else this.build();
  }

  /** Sheet template: only affects sheets created from now on */
  private async setSectionShown(key: string, shown: boolean) {
    const st = this.plugin.settings;
    st.hiddenSections = shown ? st.hiddenSections.filter((k) => k !== key) : [...new Set([...st.hiddenSections, key])];
    await this.plugin.saveData(st);
  }

  // ---------------------------------------------------------------- Obsidian before 1.13
  // The same settings, built from getSettingDefinitions(): one page at a time under a row of tabs.
  private page = 0;
  display() { this.build(); }
  private build() {
    const { containerEl } = this;
    containerEl.empty();
    const pages = (this.getSettingDefinitions() as unknown as Def[]).filter((d) => d.type === "page" && shown(d));
    this.page = Math.min(this.page, pages.length - 1);
    const tabs = containerEl.createDiv({ cls: "dnd-settings-tabs" });
    pages.forEach((p, i) => {
      const b = tabs.createEl("button", { text: p.name, cls: i === this.page ? "is-active" : "" });
      if (valueOf(p.status) === "warning") b.addClass("mod-warning");
      b.onclick = () => { this.page = i; this.build(); };
    });
    const page = pages[this.page], items = page.items ?? [];
    const el = containerEl.createDiv();
    if (page.draw) { page.draw(el); return; }
    if (page.desc) el.createEl("p", { cls: "setting-item-description" }).append(page.desc);
    // a change that shows or hides settings (the custom colour, the import steps) builds the page again
    const before = JSON.stringify(visibleKeys(items));
    this.buildItems(el, items, () => { if (JSON.stringify(visibleKeys(items)) !== before) this.build(); });
  }
  /** The groups and settings of a page; `changed` runs after a control saves its value. Pages inside pages are not used. */
  private buildItems(el: HTMLElement, items: Def[], changed: () => void) {
    for (const d of items) {
      if (!shown(d)) continue;
      if (d.type === "group" || d.type === "list") {
        if (d.heading) new Setting(el).setName(d.heading).setHeading();
        this.buildItems(el, d.items ?? [], changed);
      } else if (!d.type) this.buildSetting(el, d, changed);
    }
  }
  private buildSetting(el: HTMLElement, d: Def, changed: () => void) {
    const setting = new Setting(el).setName(d.name ?? "");
    if (d.desc) setting.setDesc(d.desc);
    if (d.control) this.buildControl(setting, d.control, changed);
    else if (d.render) d.render(setting, undefined as never);
    else if (d.action) {
      const action = d.action;
      setting.settingEl.addClass("mod-clickable");
      setting.settingEl.onclick = () => action(setting.settingEl, 0);
    }
  }
  /** A control showing getControlValue(key) and saving with setControlValue(key); text is saved when the field is left. */
  private buildControl(setting: Setting, c: NonNullable<Def["control"]>, changed: () => void) {
    const value = this.getControlValue(c.key);
    const save = async (v: unknown) => { await this.setControlValue(c.key, v); changed(); };
    switch (c.type) {
      case "toggle": setting.addToggle((x) => x.setValue(!!value).onChange(save)); break;
      case "dropdown": setting.addDropdown((x) => x.addOptions(c.options ?? {}).setValue(text(value)).onChange(save)); break;
      case "color": setting.addColorPicker((x) => x.setValue(text(value)).onChange(save)); break;
      case "textarea": setting.addTextArea((x) => {
        x.setPlaceholder(c.placeholder ?? "").setValue(text(value));
        if (c.rows) x.inputEl.rows = c.rows;
        x.inputEl.addEventListener("change", () => void save(x.getValue()));
      }); break;
      // text, folder and file paths, and any other kind of value, as text
      default: setting.addText((x) => {
        x.setPlaceholder(c.placeholder ?? "").setValue(text(value));
        x.inputEl.addEventListener("change", () => void save(x.getValue()));
      });
    }
  }
}
