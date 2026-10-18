import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type CharacterSheetPlugin from "./main";
import srdData from "../data/srd-5.1.json";
import { SECTIONS } from "./sections";
import { IMPORT_CHANGES } from "./data/build";

export interface SheetSettings {
  /** optional fixed folder for new characters; empty = last used folder (vault root the first time) */
  charactersFolder: string;
  lastFolder: string;
  /** none = manual mode (type everything in), srd = bundled SRD 5.1, imported = user's own 5etools data */
  dataSource: "none" | "srd" | "imported";
  /** optional folder of a ttrpg-convert-cli compendium, used only for links */
  compendiumFolder: string;
  fivetoolsPath: string;
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
  fivetoolsPath: "", importRules2014: true, importOnlyWithNotes: false, lastImport: "",
  theme: "plugin", customAccent: "#922610", hiddenSections: [],
};
const THEME_KEYS = ["theme", "customAccent"];
// Sheet template toggles use "section:<key>" control keys, stored as the list of hidden sections
const SECTION_PREFIX = "section:";

// Texts shared by both settings UIs below
const T = {
  charactersFolder: ["Characters folder", "Optional. Folder suggested for new characters. Leave empty to use the last folder you created a character in (the vault root the first time)."],
  dataSource: ["Rules data", "Without rules data the sheet works in manual mode: you type races, classes, features, spells and values yourself, and only simple maths (modifiers, proficiency, saves, skills and spellcasting) is automatic."],
  fivetoolsPath: ["Folder with 5etools data", "Used by the import. A folder inside this vault with the data files of a 5etools copy you are entitled to use (it contains races.json). A hidden folder such as .5etools/data keeps them out of your file list and search."],
  rules2014: ["Only 2014 rules", "Leave out the 2024 core rulebooks and other 2024-edition entries when importing."],
  onlyNotes: ["Only entries with a note", "Import only what has a note in your compendium folder, so the menus match it exactly. Overrides the option above."],
  importNow: ["Import", "Convert the data now. The result is stored in this plugin's folder."],
  compendium: ["Compendium folder", "Optional, only for links. The folder that contains the \"compendium\" and \"rules\" folders of your compendium notes. Races, classes, spells, items and features then link to their notes."],
  license: ["SRD license", ""],
  theme: ["Theme", "Accent colour of the sheets: the plugin's own, the one of your Obsidian theme, or your own choice."],
  accent: ["Accent colour", "Used for the name, section titles, lines and rollable values, in both light and dark mode."],
  template: "Sections shown in new character sheets, even while empty. Existing sheets keep their own choice: hide a section with the button next to its title, and show it again from the \"Hidden sections\" menu at the top of the sheet.",
} as const;

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
  getSettingDefinitions(): SettingDefinitionItem[] {
    const custom = () => this.plugin.settings.theme === "custom";
    return [
      { type: "group", heading: "Characters", items: [
        { name: T.charactersFolder[0], desc: T.charactersFolder[1], control: { type: "folder", key: "charactersFolder", placeholder: "Last used folder", includeRoot: true } },
      ] },
      { type: "group", heading: "Theme", items: [
        { name: T.theme[0], desc: T.theme[1], control: { type: "dropdown", key: "theme", options: THEME_OPTIONS } },
        { name: T.accent[0], desc: T.accent[1], visible: custom, control: { type: "color", key: "customAccent" } },
      ] },
      { type: "group", heading: "Sheet template", items: [
        { name: "Sections", desc: T.template },
        ...SECTIONS.map((sec) => ({ name: sec.label, control: { type: "toggle" as const, key: SECTION_PREFIX + sec.key } })),
      ] },
      { type: "group", heading: "Rules", items: [
        { name: T.dataSource[0], desc: T.dataSource[1], control: { type: "dropdown", key: "dataSource", options: SOURCE_OPTIONS } },
        { name: T.license[0], desc: attribution },
      ] },
      { type: "group", heading: "Import from 5etools", items: [
        { name: T.fivetoolsPath[0], desc: T.fivetoolsPath[1], control: { type: "text", key: "fivetoolsPath", placeholder: ".5etools/data" } },
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
      { type: "group", heading: "Compendium", items: [
        { name: T.compendium[0], desc: T.compendium[1], control: { type: "folder", key: "compendiumFolder", placeholder: "Compendium" } },
      ] },
    ];
  }
  getControlValue(key: string): unknown {
    if (key.startsWith(SECTION_PREFIX)) return !this.plugin.settings.hiddenSections.includes(key.slice(SECTION_PREFIX.length));
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }
  async setControlValue(key: string, value: unknown) {
    if (key.startsWith(SECTION_PREFIX)) { await this.setSectionShown(key.slice(SECTION_PREFIX.length), !!value); return; }
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    // these two change what the sheets show, so reload the rules data and links
    if (key === "dataSource" || key === "compendiumFolder") await this.plugin.saveSettings();
    else await this.plugin.saveData(this.plugin.settings);
    // theme changes only restyle the open sheets; the theme choice also shows or hides the custom fields
    if (THEME_KEYS.includes(key)) this.plugin.refreshSheets();
    // refreshDomState (Obsidian 1.13+) re-evaluates the `visible` predicates; checked at runtime for older versions
    if (key === "theme") (this as { refreshDomState?: () => void }).refreshDomState?.();
  }

  /** Sheet template: only affects sheets created from now on */
  private async setSectionShown(key: string, shown: boolean) {
    const st = this.plugin.settings;
    st.hiddenSections = shown ? st.hiddenSections.filter((k) => k !== key) : [...new Set([...st.hiddenSections, key])];
    await this.plugin.saveData(st);
  }

  // Obsidian before 1.13: the same settings built by hand
  display() {
    const { containerEl } = this;
    const st = this.plugin.settings;
    containerEl.empty();

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

    new Setting(containerEl).setName("Sheet template").setHeading();
    new Setting(containerEl).setName("Sections").setDesc(T.template);
    for (const sec of SECTIONS) {
      new Setting(containerEl).setName(sec.label)
        .addToggle((t) => t.setValue(!st.hiddenSections.includes(sec.key)).onChange((v) => this.setSectionShown(sec.key, v)));
    }

    new Setting(containerEl).setName("Rules").setHeading();
    new Setting(containerEl).setName(T.dataSource[0]).setDesc(T.dataSource[1])
      .addDropdown((d) => d.addOptions(SOURCE_OPTIONS).setValue(st.dataSource)
        .onChange(async (v) => { st.dataSource = v as SheetSettings["dataSource"]; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(T.license[0]).setDesc(attribution);

    new Setting(containerEl).setName("Import from 5etools").setHeading();
    new Setting(containerEl).setName(T.fivetoolsPath[0]).setDesc(T.fivetoolsPath[1])
      .addText((t) => t.setPlaceholder(".5etools/data").setValue(st.fivetoolsPath).onChange(async (v) => { st.fivetoolsPath = v; await this.plugin.saveData(st); }));
    new Setting(containerEl).setName(T.rules2014[0]).setDesc(T.rules2014[1])
      .addToggle((t) => t.setValue(st.importRules2014).onChange(async (v) => { st.importRules2014 = v; await this.plugin.saveData(st); }));
    new Setting(containerEl).setName(T.onlyNotes[0]).setDesc(T.onlyNotes[1])
      .addToggle((t) => t.setValue(st.importOnlyWithNotes).onChange(async (v) => { st.importOnlyWithNotes = v; await this.plugin.saveData(st); }));
    const imp = new Setting(containerEl).setName(T.importNow[0]).setDesc(this.importStatus());
    imp.addButton((b) => b.setButtonText("Import now").setCta().onClick(async () => { await this.plugin.importFiveTools(); imp.setDesc(this.importStatus()); }));

    new Setting(containerEl).setName("Compendium").setHeading();
    new Setting(containerEl).setName(T.compendium[0]).setDesc(T.compendium[1])
      .addText((t) => t.setPlaceholder("Compendium").setValue(st.compendiumFolder).onChange(async (v) => { st.compendiumFolder = v; await this.plugin.saveData(st); }))
      .addButton((b) => b.setButtonText("Apply").onClick(async () => { await this.plugin.saveSettings(); }));
  }
}
