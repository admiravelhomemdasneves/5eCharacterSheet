import { Modal, Notice, Setting, normalizePath } from "obsidian";
import type CharacterSheetPlugin from "../main";
import type { Detected } from "../data/detect";

/**
 * What "Detect" found in the vault: the player picks the 5etools data folder, the homebrew files
 * and the compendium folder to use. Nothing is saved until "Use these".
 */
export class DetectModal extends Modal {
  constructor(private plugin: CharacterSheetPlugin, private found: Detected, private applied: () => void) { super(plugin.app); }

  onOpen() {
    const { contentEl } = this;
    const st = this.plugin.settings;
    contentEl.createEl("h2", { text: "Found in this vault" });
    contentEl.addClass("dnd-detect");
    const { dataFolders, homebrew, compendiums } = this.found;
    if (!dataFolders.length && !homebrew.length && !compendiums.length) {
      contentEl.createEl("p", { text: "No 5etools data folder, 5etools homebrew or compendium was found. Copy them into this vault, for example in .5etools/data and .5etools/homebrew, and try again." });
      new Setting(contentEl).addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
      return;
    }
    const data = this.choice(contentEl, "5etools data folder", "The folder of a 5etools copy, with races.json.", dataFolders, st.fivetoolsPath);
    const brew = new Set(homebrew.map((h) => h.path));
    if (homebrew.length) {
      new Setting(contentEl).setName("Homebrew files").setDesc("Checked files are added to the data when importing.").setHeading();
      for (const h of homebrew) {
        new Setting(contentEl).setName(h.path).setDesc(h.sources.join(", "))
          .addToggle((t) => t.setValue(true).onChange((v) => { if (v) brew.add(h.path); else brew.delete(h.path); }));
      }
    }
    const comp = this.choice(contentEl, "Compendium folder", "A ttrpg-convert-cli compendium, for links to its notes.", compendiums, st.compendiumFolder);
    if (this.found.truncated) contentEl.createEl("p", { cls: "dnd-hint", text: "Many JSON files were found, so not all of them were checked for homebrew. Add any missing ones by hand." });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Use these").setCta().onClick(async () => {
        const compendiumChanged = comp.value != null && comp.value !== st.compendiumFolder;
        if (data.value != null) st.fivetoolsPath = data.value;
        if (comp.value != null) st.compendiumFolder = comp.value;
        // the list keeps its order: unchecked files leave it, new checked ones go at the end, and
        // files listed by hand that the scan did not find stay
        const found = new Set(homebrew.map((h) => h.path)), listed = new Set(st.homebrewFiles.map((p) => normalizePath(p)));
        st.homebrewFiles = [...st.homebrewFiles.filter((p) => !found.has(normalizePath(p)) || brew.has(normalizePath(p))), ...[...brew].filter((p) => !listed.has(p))];
        // a new compendium changes the sheets' links, so it reloads the data
        if (compendiumChanged) await this.plugin.saveSettings(); else await this.plugin.saveData(st);
        this.close();
        this.applied();
        new Notice("Saved. Press the import button to import the data.");
      }));
  }

  /** One option per folder found, plus "Don't change" when something is already set; `value` is the pick (null = keep). */
  private choice(el: HTMLElement, name: string, desc: string, options: string[], setting: string) {
    const pick: { value: string | null } = { value: null };
    if (!options.length) return pick;
    const current = setting.trim() ? normalizePath(setting) : "";
    new Setting(el).setName(name).setDesc(desc).setHeading();
    const group = `dnd-detect-${name}`;
    const items: (string | null)[] = current && !options.includes(current) ? [...options, null] : options;
    const initial = options.includes(current) ? current : current ? null : options[0];
    pick.value = initial;
    for (const opt of items) {
      const row = el.createEl("label", { cls: "dnd-detect-option" });
      const input = row.createEl("input", { type: "radio", attr: { name: group } });
      input.checked = opt === initial;
      input.onchange = () => { if (input.checked) pick.value = opt; };
      row.createSpan({ text: opt ?? `Don't change (${current})` });
    }
    return pick;
  }

  onClose() { this.contentEl.empty(); }
}
