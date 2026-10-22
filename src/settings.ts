import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type CharacterSheetPlugin from "./main";
import srdData from "../data/srd-5.1.json";
import { SECTIONS } from "./sections";
import { IMPORT_CHANGES } from "./data/build";
import { DetectModal } from "./ui/detect";

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
  /** plugin = the sheet's own accent colour, obsidian = the active theme's accent, custom = customAccent */
  theme: "plugin" | "obsidian" | "custom";
  customAccent: string;
  /** sections left out of new sheets (Sheet template); empty = all sections */
  hiddenSections: string[];
}
export const DEFAULT_SETTINGS: SheetSettings = {
  charactersFolder: "", lastFolder: "", dataSource: "none", compendiumFolder: "",
  fivetoolsPath: "", homebrewFiles: [], importRules2014: true, importOnlyWithNotes: false, lastImport: "",
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
  fivetoolsPath: ["Folder with 5etools data", "Used by the import. A folder inside this vault with the data files of a 5etools copy you are entitled to use (it contains races.json). A hidden folder such as .5etools/data keeps them out of your file list and search."],
  homebrew: ["Homebrew files", "Optional. Homebrew in the 5etools format (JSON files inside this vault), one path per line. Their races, classes, subclasses, backgrounds, feats, spells and items are added to the 5etools data when importing."],
  rules2014: ["Only 2014 rules", "Leave out the 2024 core rulebooks and other 2024-edition entries when importing."],
  onlyNotes: ["Only entries with a note", "Import only what has a note in your compendium folder, so the menus match it exactly. Overrides the option above."],
  importNow: ["Import", "Convert the data now. The result is stored in this plugin's folder."],
  compendium: ["Compendium folder", "Optional, only for links. The folder that contains the \"compendium\" and \"rules\" folders of your compendium notes. Races, classes, spells, items and features then link to their notes."],
  license: ["SRD license", ""],
  theme: ["Theme", "Accent colour of the sheets: the plugin's own, the one of your Obsidian theme, or your own choice."],
  accent: ["Accent colour", "Used for the name, section titles, lines and rollable values, in both light and dark mode."],
  template: "Sections shown in new character sheets, even while empty. Existing sheets keep their own choice: hide a section with the button next to its title, and show it again from the \"Hidden sections\" menu at the top of the sheet.",
  // pages, and the steps of the import
  general: "Where new characters are created and how the sheets look.",
  rules: "Where races, classes, spells and items come from: typed in by you (manual mode), the SRD 5.1 included with the plugin, or your own 5etools data.",
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
/** The settings pages; before Obsidian 1.13 they are tabs */
const PAGES = [["general", "General"], ["template", "Sheet template"], ["rules", "Rules data"], ["compendium", "Compendium"]] as const;
type Page = (typeof PAGES)[number][0];

const SOURCE_OPTIONS: Record<SheetSettings["dataSource"], string> = { none: "None (manual mode)", srd: "SRD 5.1 (included)", imported: "Imported from 5etools" };
const THEME_OPTIONS: Record<SheetSettings["theme"], string> = { plugin: "Original", obsidian: "Obsidian theme", custom: "Custom" };
const attribution = (srdData as { meta: { attribution?: string } }).meta.attribution || "";

export class SheetSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CharacterSheetPlugin) { super(app, plugin); }

  private importStatus() {
    const st = this.plugin.settings;
    if (!st.lastImport) return "Not imported yet.";
    return `Last import: ${st.lastImport}` + (this.plugin.importIsOutdated ? ` — out of date: press "Import now" to update it (${IMPORT_CHANGES}).` : "");
  }

  // Obsidian 1.13+: declarative settings, also searchable from the settings search
  /** shown on the Sheet template page entry */
  private sectionsShown() { return `${SECTIONS.length - this.plugin.settings.hiddenSections.length} of ${SECTIONS.length} sections shown`; }
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
      { type: "page", name: "Sheet template", desc: T.template, displayValue: () => this.sectionsShown(), items: [
        { type: "group", items: SECTIONS.map((sec) => ({ name: sec.label, control: { type: "toggle" as const, key: SECTION_PREFIX + sec.key } })) },
      ] },
      { type: "page", name: "Rules data", desc: T.rules, displayValue: () => SOURCE_OPTIONS[st.dataSource], status: () => (this.importNeedsAttention() ? "warning" : null), items: [
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
              }));
            },
          },
        ] },
      ] },
      { type: "page", name: "Compendium", desc: T.compendiumPage, displayValue: () => st.compendiumFolder.trim() || "Not set", items: [
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
    // Obsidian 1.13+ redraws the declarative settings with update(); older versions use display()
    const redraw = () => {
      const tab = this as { update?: () => void };
      if (tab.update) tab.update(); else this.build();
    };
    new DetectModal(this.plugin, found, redraw).open();
  }

  /** Sheet template: only affects sheets created from now on */
  private async setSectionShown(key: string, shown: boolean) {
    const st = this.plugin.settings;
    st.hiddenSections = shown ? st.hiddenSections.filter((k) => k !== key) : [...new Set([...st.hiddenSections, key])];
    await this.plugin.saveData(st);
  }

  // Obsidian before 1.13: the same settings built by hand, one page at a time under a row of tabs
  private page: Page = "general";
  display() { this.build(); }
  private build() {
    const { containerEl } = this;
    containerEl.empty();
    const tabs = containerEl.createDiv({ cls: "dnd-settings-tabs" });
    for (const [key, label] of PAGES) {
      const b = tabs.createEl("button", { text: label, cls: key === this.page ? "is-active" : "" });
      if (key === "rules" && this.importNeedsAttention()) b.addClass("mod-warning");
      b.onclick = () => { this.page = key; this.build(); };
    }
    const el = containerEl.createDiv();
    if (this.page === "general") this.generalPage(el);
    else if (this.page === "template") this.templatePage(el);
    else if (this.page === "rules") this.rulesPage(el);
    else this.compendiumPage(el);
  }
  private generalPage(containerEl: HTMLElement) {
    const st = this.plugin.settings;
    containerEl.createEl("p", { cls: "setting-item-description", text: T.general });
    new Setting(containerEl).setName("Characters").setHeading();
    new Setting(containerEl).setName(T.charactersFolder[0]).setDesc(T.charactersFolder[1])
      .addText((t) => t.setPlaceholder("Last used folder").setValue(st.charactersFolder).onChange(async (v) => { st.charactersFolder = v; await this.plugin.saveData(st); }));

    new Setting(containerEl).setName("Theme").setHeading();
    const saveTheme = async () => { await this.plugin.saveData(st); this.plugin.refreshSheets(); };
    new Setting(containerEl).setName(T.theme[0]).setDesc(T.theme[1])
      .addDropdown((d) => d.addOptions(THEME_OPTIONS).setValue(st.theme)
        .onChange(async (v) => { st.theme = v as SheetSettings["theme"]; await saveTheme(); customFields(); }));
    // the colour picker is only shown for the Custom theme, so it is rebuilt when the choice changes
    const customEl = containerEl.createDiv();
    const customFields = () => {
      customEl.empty();
      if (st.theme !== "custom") return;
      new Setting(customEl).setName(T.accent[0]).setDesc(T.accent[1])
        .addColorPicker((c) => c.setValue(st.customAccent).onChange(async (v) => { st.customAccent = v; await saveTheme(); }));
    };
    customFields();
    new Setting(containerEl).setName(T.more).setDesc(withLinks("", L.general));
  }
  private templatePage(containerEl: HTMLElement) {
    const st = this.plugin.settings;
    containerEl.createEl("p", { cls: "setting-item-description", text: T.template });
    for (const sec of SECTIONS) {
      new Setting(containerEl).setName(sec.label)
        .addToggle((t) => t.setValue(!st.hiddenSections.includes(sec.key)).onChange((v) => this.setSectionShown(sec.key, v)));
    }
  }
  private rulesPage(containerEl: HTMLElement) {
    const st = this.plugin.settings;
    containerEl.createEl("p", { cls: "setting-item-description", text: T.rules });
    new Setting(containerEl).setName(T.dataSource[0]).setDesc(withLinks(T.dataSource[1], L.rules))
      .addDropdown((d) => d.addOptions(SOURCE_OPTIONS).setValue(st.dataSource)
        // the import steps are shown for imported data only
        .onChange(async (v) => { st.dataSource = v as SheetSettings["dataSource"]; await this.plugin.saveSettings(); this.build(); }));
    new Setting(containerEl).setName(T.license[0]).setDesc(attribution);
    if (st.dataSource !== "imported") return;

    new Setting(containerEl).setName(T.step1[0]).setHeading();
    new Setting(containerEl).setName(T.step1[1]).setDesc(withLinks(T.step1[2], L.guide));
    new Setting(containerEl).setName(T.step2[0]).setHeading();
    new Setting(containerEl).setName(T.step2[1]).setDesc(T.step2[2]);
    new Setting(containerEl).setName(T.detect[0]).setDesc(T.detect[1]).addButton((b) => b.setButtonText("Detect").onClick(() => this.openDetect()));
    new Setting(containerEl).setName(T.fivetoolsPath[0]).setDesc(T.fivetoolsPath[1])
      .addText((t) => t.setPlaceholder(".5etools/data").setValue(st.fivetoolsPath).onChange(async (v) => { st.fivetoolsPath = v; await this.plugin.saveData(st); }));
    new Setting(containerEl).setName(T.homebrew[0]).setDesc(withLinks(T.homebrew[1], L.homebrew, L.homebrewRepo))
      .addTextArea((t) => { t.setPlaceholder(HOMEBREW_PLACEHOLDER).setValue(st.homebrewFiles.join("\n")).onChange(async (v) => { st.homebrewFiles = pathLines(v); await this.plugin.saveData(st); }); t.inputEl.rows = 4; });
    new Setting(containerEl).setName(T.step3).setHeading();
    new Setting(containerEl).setName(T.rules2014[0]).setDesc(T.rules2014[1])
      .addToggle((t) => t.setValue(st.importRules2014).onChange(async (v) => { st.importRules2014 = v; await this.plugin.saveData(st); }));
    new Setting(containerEl).setName(T.onlyNotes[0]).setDesc(T.onlyNotes[1])
      .addToggle((t) => t.setValue(st.importOnlyWithNotes).onChange(async (v) => { st.importOnlyWithNotes = v; await this.plugin.saveData(st); }));
    const imp = new Setting(containerEl).setName(T.importNow[0]).setDesc(this.importStatus());
    imp.addButton((b) => b.setButtonText("Import now").setCta().onClick(async () => { await this.plugin.importFiveTools(); this.build(); }));
  }
  private compendiumPage(containerEl: HTMLElement) {
    const st = this.plugin.settings;
    containerEl.createEl("p", { cls: "setting-item-description", text: T.compendiumPage });
    new Setting(containerEl).setName(T.compendium[0]).setDesc(withLinks(T.compendium[1], L.compendium))
      .addText((t) => t.setPlaceholder("Compendium").setValue(st.compendiumFolder).onChange(async (v) => { st.compendiumFolder = v; await this.plugin.saveData(st); }))
      .addButton((b) => b.setButtonText("Apply").onClick(async () => { await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Making a compendium").setDesc(withLinks(T.makeCompendium, L.convert, L.convertCli, L.convertUi));
  }
}
