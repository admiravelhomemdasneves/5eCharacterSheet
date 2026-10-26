import { Modal, Notice, Setting } from "obsidian";
import type CharacterSheetPlugin from "../main";
import { applyDetected, folderOptions, homebrewFolders, type Detected } from "../data/detect";

/**
 * What "Detect" found in the vault: the player checks the 5etools data folder, the homebrew files
 * and the compendium folder to use. Each part, and each folder of homebrew, can be closed.
 * Nothing is saved until "Use these".
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
    contentEl.createEl("p", { cls: "dnd-hint", text: "Check what to use. A data or compendium folder left unchecked is cleared in the settings." });
    const data = this.folderChoice(contentEl, "5etools data folder", "The folder of a 5etools copy, with races.json.", dataFolders, st.fivetoolsPath);
    const brew = this.homebrewChoice(contentEl);
    const comp = this.folderChoice(contentEl, "Compendium folder", "A ttrpg-convert-cli compendium, for links to its notes.", compendiums, st.compendiumFolder);

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Use these").setCta().onClick(async () => {
        const next = applyDetected(st, this.found, { data: data.value, compendium: comp.value, homebrew: brew });
        const compendiumChanged = next.compendiumFolder !== st.compendiumFolder;
        Object.assign(st, next);
        // a new compendium changes the sheets' links, so it reloads the data
        if (compendiumChanged) await this.plugin.saveSettings(); else await this.plugin.saveData(st);
        this.close();
        this.applied();
        new Notice("Saved. Press the import button to import the data.");
      }));
  }

  /** A part of the dialog that can be closed, open at first. */
  private part(el: HTMLElement, title: string, desc: string) {
    const d = el.createEl("details", { cls: "dnd-detect-part", attr: { open: "" } });
    const sm = d.createEl("summary");
    sm.createSpan({ cls: "dnd-detect-title", text: title });
    d.createDiv({ cls: "dnd-hint", text: desc });
    return { body: d, summary: sm };
  }
  /** A checkbox and its text on one row. */
  private checkRow(el: HTMLElement, text: string, checked: boolean, detail = "") {
    const row = el.createEl("label", { cls: "dnd-detect-option" });
    const input = row.createEl("input", { type: "checkbox" });
    input.checked = checked;
    row.createSpan({ text });
    if (detail) row.createSpan({ cls: "dnd-hint", text: detail });
    return input;
  }

  /**
   * The folders found for one setting, at most one checked; `value` is the checked one (null = none).
   * The folder set now is listed too when the scan did not find it.
   */
  private folderChoice(el: HTMLElement, title: string, desc: string, found: string[], setting: string) {
    const { options, current, initial } = folderOptions(found, setting);
    const pick: { value: string | null } = { value: initial };
    if (!options.length) return pick;
    const { body } = this.part(el, title, desc);
    const inputs = options.map((opt) => {
      const input = this.checkRow(body, opt, opt === initial, opt === current && !found.includes(opt) ? "set now, not found by Detect" : "");
      input.onchange = () => {
        pick.value = input.checked ? opt : null;
        if (input.checked) inputs.forEach((x) => { if (x !== input) x.checked = false; });
      };
      return input;
    });
    return pick;
  }

  /** The homebrew files by folder: a folder's checkbox checks or unchecks all its files. Returns the checked paths. */
  private homebrewChoice(el: HTMLElement) {
    const { homebrew } = this.found;
    const checked = new Set(homebrew.map((h) => h.path));
    if (!homebrew.length) return checked;
    const { body, summary } = this.part(el, "Homebrew files", "Checked files are added to the data when importing.");
    const total = summary.createSpan({ cls: "dnd-hint" });
    const updates: (() => void)[] = [];
    const refresh = () => { updates.forEach((u) => u()); total.setText(` ${checked.size} of ${homebrew.length}`); };
    for (const g of homebrewFolders(homebrew)) {
      const d = body.createEl("details", { cls: "dnd-detect-folder", attr: { open: "" } });
      const sm = d.createEl("summary");
      const all = sm.createEl("input", { type: "checkbox" });
      // the checkbox sits in the summary: clicking it must not open or close the folder
      all.onclick = (e) => e.stopPropagation();
      sm.createSpan({ text: g.folder || "(vault root)" });
      const count = sm.createSpan({ cls: "dnd-hint" });
      const inputs = g.files.map((h) => {
        const input = this.checkRow(d, h.path.slice(g.folder ? g.folder.length + 1 : 0), true, h.sources.join(", "));
        input.onchange = () => { if (input.checked) checked.add(h.path); else checked.delete(h.path); refresh(); };
        return { input, path: h.path };
      });
      all.onchange = () => {
        for (const { input, path } of inputs) { input.checked = all.checked; if (all.checked) checked.add(path); else checked.delete(path); }
        refresh();
      };
      updates.push(() => {
        const n = inputs.filter((x) => x.input.checked).length;
        all.checked = n === inputs.length;
        all.indeterminate = n > 0 && n < inputs.length;
        count.setText(` ${n} of ${inputs.length}`);
      });
    }
    refresh();
    return checked;
  }

  onClose() { this.contentEl.empty(); }
}
