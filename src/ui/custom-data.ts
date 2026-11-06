// The "Custom data" settings page: the player's own entries (src/custom), listed as on the "Import data"
// page, to create, edit, copy and delete; and the file they are kept in.
import { Notice, Platform, Setting, setIcon } from "obsidian";
import type CharacterSheetPlugin from "../main";
import type { CustomEntry } from "../custom/format";
import type { KindDef } from "../custom/schema";
import { DEFAULT_CUSTOM_PATH } from "../custom/store";
import { RULESETS, rulesetById } from "../rules/rulesets";
import { EntryModal } from "./custom-form";
import { ConfirmModal, Picker } from "./widgets";
import { lc } from "../text";

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export class CustomDataView {
  private query = "";
  private kind = "";
  /** the rules whose entries are made here */
  private rules: string;
  constructor(private plugin: CharacterSheetPlugin) { this.rules = plugin.settings.defaultRuleset; }
  private get context() { return this.plugin.contextById(this.rules); }

  draw(el: HTMLElement) {
    el.empty();
    el.addClass("dnd-report", "dnd-import-data", "dnd-custom-data");
    const { plugin } = this, c = this.context, ruleset = c.ruleset!, file = plugin.customFile;
    new Setting(el).setName("Rules").setDesc("New entries are for these rules, and only sheets using them see them.").addDropdown((d) => d.addOptions(Object.fromEntries(RULESETS.map((r) => [r.id, r.label]))).setValue(this.rules).onChange((v) => { this.rules = v; this.redraw(); }));
    el.createEl("p", { cls: "dnd-hint", text: `Your own entries for ${ruleset.label}. With the SRD or imported rules data they are in the sheets' menus, under "Custom data"; in manual mode, "From custom data…" fills a sheet's fields with them.` });

    new Setting(el).setName("File").setDesc(`Where they are kept, in this vault. A folder starting with a dot is hidden from the file list and search. After editing the file by hand, load it again.`)
      .addText((t) => {
        t.setPlaceholder(DEFAULT_CUSTOM_PATH).setValue(plugin.settings.customDataPath);
        t.inputEl.addEventListener("change", () => void (async () => {
          plugin.settings.customDataPath = t.getValue().trim();
          await plugin.saveSettings();
          this.redraw();
        })());
      })
      .addButton((b) => b.setButtonText("Reload").onClick(async () => { await plugin.reloadData(); new Notice("Custom data reloaded."); this.redraw(); }));
    new Setting(el).setName("New entry").setDesc("A race, subrace, class, subclass, background, feat, spell or item of your own, or a trait or feature for a race or class of the rules data.")
      .addButton((b) => b.setButtonText("Create an entry").setCta().onClick(() => this.create()));

    if (c.customProblems.length) {
      const d = el.createEl("details", { cls: "dnd-report-messages", attr: { open: "" } });
      d.createEl("summary", { text: `Problems (${c.customProblems.length})` });
      const ul = d.createEl("ul");
      for (const m of c.customProblems) ul.createEl("li", { text: m });
    }
    if (c.customOther) el.createEl("p", { cls: "dnd-hint", text: `${c.customOther} entr${c.customOther === 1 ? "y is" : "ies are"} for other rules, so not used with this rules data.` });

    if (!file.entries.length) { el.createEl("p", { cls: "dnd-hint", text: "No custom entries yet." }); return; }
    const bar = el.createDiv({ cls: "dnd-import-data-bar" });
    const search = bar.createEl("input", { type: "search", attr: { placeholder: "Search entries", "aria-label": "Search entries" } });
    search.value = this.query;
    const kinds = bar.createEl("select", { cls: "dropdown", attr: { "aria-label": "Kind" } });
    kinds.createEl("option", { value: "", text: "All kinds" });
    for (const k of ruleset.kinds) kinds.createEl("option", { value: k.kind, text: k.label[1] });
    kinds.value = this.kind;
    const list = el.createDiv();
    const fill = () => this.table(list);
    search.oninput = () => { this.query = search.value; fill(); };
    kinds.onchange = () => { this.kind = kinds.value; fill(); };
    fill();
  }

  /** The entries matching the search and kind, by kind (in the ruleset's order) and name. */
  private table(el: HTMLElement) {
    el.empty();
    const { plugin } = this, q = lc(this.query.trim());
    const kindOf = (e: CustomEntry) => rulesetById(e.ruleset).kinds.find((k) => k.kind === e.kind) ?? null;
    const order = (e: CustomEntry) => this.context.ruleset!.kinds.findIndex((k) => k.kind === e.kind);
    const entries = plugin.customFile.entries.filter((e) => (!this.kind || e.kind === this.kind) && (!q || lc(e.name).includes(q)))
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    if (!entries.length) { el.createEl("p", { cls: "dnd-hint", text: "No entries match." }); return; }
    const t = el.createDiv({ cls: "dnd-report-scroll" }).createEl("table", { cls: "dnd-report-entries" });
    const h = t.createEl("thead").createEl("tr");
    for (const label of ["Name", "Type", "Details", "Note", ""]) h.createEl("th", { text: label });
    const body = t.createEl("tbody");
    for (const e of entries) this.row(body, e, kindOf(e));
  }

  private row(body: HTMLElement, e: CustomEntry, def: KindDef | null) {
    const { plugin } = this;
    const other = e.ruleset !== this.rules;
    const tr = body.createEl("tr", { cls: other || !def ? "is-left-out" : "" });
    tr.createEl("td", { text: e.name });
    tr.createEl("td", { text: (def?.label[0] ?? e.kind) + (other ? ` (${rulesetById(e.ruleset).label})` : "") });
    tr.createEl("td", { text: def?.summary?.(e) ?? "" });
    const note = tr.createEl("td", { cls: "dnd-import-data-note" });
    if (e.link) {
      const a = note.createEl("a", { cls: "internal-link", text: fileName(e.link), href: e.link, attr: { title: e.link } });
      a.onclick = (ev) => { ev.preventDefault(); void plugin.app.workspace.openLinkText(e.link!, "", Platform.isDesktop ? "window" : "tab"); };
    } else note.createSpan({ cls: "dnd-hint", text: "None" });

    const actions = tr.createEl("td", { cls: "dnd-import-data-actions" });
    const act = (icon: string, label: string, run: () => void, cls = "") => {
      const b = actions.createEl("button", { cls: `clickable-icon ${cls}`, attr: { "aria-label": label } });
      setIcon(b, icon);
      b.onclick = run;
    };
    if (def) {
      act("pencil", "Edit", () => new EntryModal(plugin.app, plugin, def, e, () => this.redraw(), false, this.rules).open());
      act("copy", "Make a copy", () => new EntryModal(plugin.app, plugin, def, e, () => this.redraw(), true, this.rules).open());
    }
    act("trash-2", "Delete", () => new ConfirmModal(plugin.app, `Delete ${e.name}?`,
      "Sheets that use it keep it by name only, and lose what it gave them. This can't be undone.", "Delete", async () => {
        await plugin.deleteCustomEntry(e.id);
        new Notice(`Deleted ${e.name}.`);
        this.redraw();
      }).open(), "mod-warning");
  }

  /** "+ New entry": the kind first, then its form. */
  private create() {
    const { plugin } = this, c = this.context;
    const ctx = { data: c.manual ? c.customOnly : c.rules.data };
    new Picker(plugin.app, c.ruleset!.kinds, (k) => k.label[0], (k) => {
      const why = k.available?.(ctx);
      if (why) { new Notice(why); return; }
      window.setTimeout(() => new EntryModal(plugin.app, plugin, k, null, () => this.redraw(), false, this.rules).open(), 0);
    }, "What do you want to create?", (k) => k.available?.(ctx) ?? "").open();
  }

  /** set by the page that shows this view: draws it again after a change */
  redraw: () => void = () => {};
}

/** Asks before doing something that can't be undone. */
