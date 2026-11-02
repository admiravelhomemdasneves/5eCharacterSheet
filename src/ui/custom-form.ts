// The form of a custom entry (Custom data): its name, the fields its kind has (src/custom/schema.ts)
// and the note it links to. Drawn from the fields, so it knows nothing of the rules.
import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import type CharacterSheetPlugin from "../main";
import { newEntryId, type CustomEntry } from "../custom/format";
import { choicesOf, emptyData, emptyValue, missingFields, type Choice, type CustomContext, type FieldDef, type KindDef } from "../custom/schema";
import { NoteSuggestModal } from "./import-data";
import { lc } from "../text";

export class EntryModal extends Modal {
  private name: string;
  private link: string;
  private data: Record<string, unknown>;
  private ctx: CustomContext;
  /** `entry`: the entry to edit (null: a new one; `copy`: a new one with its values) */
  constructor(app: App, private plugin: CharacterSheetPlugin, private def: KindDef, private entry: CustomEntry | null, private saved: () => void, private copy = false) {
    super(app);
    this.name = entry ? (copy ? `${entry.name} (copy)` : entry.name) : "";
    this.link = entry?.link ?? "";
    this.data = { ...emptyData(def.fields), ...structuredClone(entry?.data ?? {}) };
    this.ctx = { data: plugin.manual ? plugin.customOnly : plugin.rules.data };
  }
  private get editing() { return !!this.entry && !this.copy; }

  onOpen() {
    this.modalEl.addClass("dnd-entry-modal");
    this.draw();
  }
  onClose() { this.contentEl.empty(); }

  /** The whole form again: a field shown only for some values (armour fields) appears or goes. */
  private draw() {
    const { contentEl, def } = this;
    const top = contentEl.scrollTop;
    contentEl.empty();
    this.titleEl.setText(`${this.editing ? "Edit" : "New"} ${lc(def.label[0])}`);
    new Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder(`${def.label[0]} name`).setValue(this.name).onChange((v) => (this.name = v));
      if (!this.name) window.setTimeout(() => t.inputEl.focus(), 50);
    });
    for (const f of def.fields) if (!f.visible || f.visible(this.data)) this.field(contentEl, f);
    const note = new Setting(contentEl).setName("Note").setDesc("A note about it, opened from the sheet (with a preview on hover).");
    note.addText((t) => t.setPlaceholder("Folder/note").setValue(this.link).onChange((v) => (this.link = v.trim())));
    note.addExtraButton((b) => b.setIcon("search").setTooltip("Choose a note").onClick(() => new NoteSuggestModal(this.app, "", false, async (path) => { this.link = path ?? ""; this.draw(); }).open()));
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.editing ? "Save" : "Create").setCta().onClick(() => void this.save()));
    contentEl.scrollTop = top;
  }

  /** A field as a setting row; a list is a heading with its rows under it. */
  private field(el: HTMLElement, f: FieldDef) {
    const s = new Setting(el).setName(f.label + (f.required ? " *" : ""));
    if (f.help) s.setDesc(f.help);
    const value = this.data[f.key];
    const set = (v: unknown, redraw = false) => { this.data[f.key] = v; if (redraw) this.draw(); };
    switch (f.type) {
      case "text": s.addText((t) => t.setPlaceholder(f.placeholder ?? "").setValue(asText(value)).onChange((v) => set(v))); break;
      case "markdown":
        s.settingEl.addClass("dnd-entry-wide");
        s.addTextArea((t) => { t.setPlaceholder(f.placeholder ?? "Markdown").setValue(asText(value)).onChange((v) => set(v)); t.inputEl.rows = 6; });
        break;
      case "number": s.addText((t) => {
        t.inputEl.type = "number";
        if (f.min != null) t.inputEl.min = String(f.min);
        if (f.max != null) t.inputEl.max = String(f.max);
        if (f.step != null) t.inputEl.step = String(f.step);
        t.setValue(asText(value)).onChange((v) => set(v === "" ? emptyValue(f) : Number(v)));
      }); break;
      case "checkbox": s.addToggle((t) => t.setValue(value === true).onChange((v) => set(v, true))); break;
      case "select": s.addDropdown((d) => {
        d.addOption("", "—");
        for (const c of choicesOf(f, this.ctx)) d.addOption(c.value, c.label);
        d.setValue(asText(value)).onChange((v) => set(v, true));
      }); break;
      case "multiselect":
        s.settingEl.addClass("dnd-entry-wide");
        chips(s.controlEl, choicesOf(f, this.ctx), asList(value), (v) => set(v));
        break;
      case "list": this.list(s, f, value); break;
    }
  }

  /** The rows of a list field, each with its fields inline and a button to remove it. */
  private list(s: Setting, f: Extract<FieldDef, { type: "list" }>, value: unknown) {
    const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
    s.settingEl.addClass("dnd-entry-list");
    s.addButton((b) => b.setButtonText(f.addLabel).onClick(() => { this.data[f.key] = [...items, emptyData(f.of)]; this.draw(); }));
    const box = s.settingEl.parentElement!.createDiv({ cls: "dnd-entry-rows" });
    items.forEach((row, i) => {
      const line = box.createDiv({ cls: "dnd-entry-row" });
      for (const sub of f.of) {
        const cell = line.createDiv({ cls: "dnd-entry-cell" });
        cell.createDiv({ cls: "dnd-label", text: sub.label });
        this.inline(cell, sub, row);
      }
      const del = line.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Remove" } });
      setIcon(del, "x");
      del.onclick = () => { this.data[f.key] = items.filter((_, j) => j !== i); this.draw(); };
    });
  }
  /** A field of a list's row, as a small control. */
  private inline(el: HTMLElement, f: FieldDef, row: Record<string, unknown>) {
    const value = row[f.key] ?? emptyValue(f);
    switch (f.type) {
      case "select": {
        const sel = el.createEl("select", { cls: "dropdown" });
        sel.createEl("option", { value: "", text: "—" });
        for (const c of choicesOf(f, this.ctx)) sel.createEl("option", { value: c.value, text: c.label });
        sel.value = asText(value);
        sel.onchange = () => { row[f.key] = sel.value; };
        break;
      }
      case "multiselect": chips(el, choicesOf(f, this.ctx), asList(value), (v) => { row[f.key] = v; }); break;
      case "checkbox": {
        const cb = el.createEl("input", { type: "checkbox" });
        cb.checked = value === true;
        cb.onchange = () => { row[f.key] = cb.checked; };
        break;
      }
      case "list": break;
      default: {
        const input = el.createEl(f.type === "markdown" ? "textarea" : "input", { attr: f.type === "number" ? { type: "number" } : { type: "text" } });
        if (f.type === "number" && f.min != null) input.setAttr("min", f.min);
        if (f.type === "number" && f.max != null) input.setAttr("max", f.max);
        input.value = asText(value);
        input.onchange = () => { row[f.key] = f.type === "number" ? (input.value === "" ? emptyValue(f) : Number(input.value)) : input.value; };
      }
    }
  }

  private async save() {
    const name = this.name.trim();
    const missing = [...(name ? [] : ["Name"]), ...missingFields(this.def.fields, this.data)];
    if (missing.length) { new Notice(`Fill in: ${missing.join(", ")}.`); return; }
    const others = this.plugin.customFile.entries.filter((x) => !(this.editing && x.id === this.entry!.id));
    if (others.some((x) => x.kind === this.def.kind && lc(x.name) === lc(name))) { new Notice(`There is already a custom ${lc(this.def.label[0])} named ${name}.`); return; }
    // only the fields that apply are kept (an item that stopped being a weapon loses its damage)
    const data = Object.fromEntries(this.def.fields.filter((f) => !f.visible || f.visible(this.data)).map((f) => [f.key, this.data[f.key]]));
    const e: CustomEntry = {
      id: this.editing ? this.entry!.id : newEntryId(name, new Set(this.plugin.customFile.entries.map((x) => x.id))),
      ruleset: this.editing ? this.entry!.ruleset : this.plugin.ruleset.id, kind: this.def.kind, name,
      ...(this.link ? { link: this.link } : {}), data, updated: new Date().toISOString(),
    };
    try {
      await this.plugin.saveCustomEntry(e);
    } catch (err) {
      console.error("5e Character Sheet: could not save the custom data", err);
      new Notice(`Could not save the custom data: ${(err as Error).message}`);
      return;
    }
    this.close();
    this.saved();
  }
}

const asText = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** Toggle buttons for a multiselect field: `onChange` gets the values picked, in the options' order. */
function chips(el: HTMLElement, options: Choice[], picked: string[], onChange: (v: string[]) => void) {
  const box = el.createDiv({ cls: "dnd-entry-chips" });
  const on = new Set(picked);
  // values picked that are no longer offered (e.g. a class not in the data) stay picked
  const kept = picked.filter((v) => !options.some((o) => o.value === v));
  for (const o of options) {
    const b = box.createEl("button", { text: o.label, cls: on.has(o.value) ? "is-active" : "" });
    b.onclick = (ev) => {
      ev.preventDefault();
      if (on.has(o.value)) on.delete(o.value); else on.add(o.value);
      b.toggleClass("is-active", on.has(o.value));
      onChange([...options.map((x) => x.value).filter((v) => on.has(v)), ...kept]);
    };
  }
}
