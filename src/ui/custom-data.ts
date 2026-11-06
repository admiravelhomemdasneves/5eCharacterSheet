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
  /** the rules of the entries listed ("": all) */
  private rules = "";
  constructor(private plugin: CharacterSheetPlugin) {}

  draw(el: HTMLElement) {
    el.empty();
    el.addClass("dnd-report", "dnd-import-data", "dnd-custom-data");
    const { plugin } = this, file = plugin.customFile;
    el.createEl("p", { cls: "dnd-hint", text: "Your own entries. Each is for one set of rules, chosen in its form: sheets with those rules list it in their menus, and in manual mode a button fills a sheet's fields with it." });

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

    const problems = [...new Set(RULESETS.flatMap((r) => plugin.contextById(r.id).customProblems))];
    if (problems.length) {
      const d = el.createEl("details", { cls: "dnd-report-messages", attr: { open: "" } });
      d.createEl("summary", { text: `Problems (${problems.length})` });
      const ul = d.createEl("ul");
      for (const m of problems) ul.createEl("li", { text: m });
    }

    if (!file.entries.length) { el.createEl("p", { cls: "dnd-hint", text: "No custom entries yet." }); return; }
    const bar = el.createDiv({ cls: "dnd-import-data-bar" });
    const search = bar.createEl("input", { type: "search", attr: { placeholder: "Search entries", "aria-label": "Search entries" } });
    search.value = this.query;
    const rules = bar.createEl("select", { cls: "dropdown", attr: { "aria-label": "Rules" } });
    rules.createEl("option", { value: "", text: "All rules" });
    for (const r of RULESETS) rules.createEl("option", { value: r.id, text: r.label });
    rules.value = this.rules;
    const kinds = bar.createEl("select", { cls: "dropdown", attr: { "aria-label": "Kind" } });
    kinds.createEl("option", { value: "", text: "All kinds" });
    // the same kind can have another name under other rules (races and species)
    for (const k of RULESETS[0].kinds) kinds.createEl("option", { value: k.kind, text: [...new Set(RULESETS.flatMap((r) => r.kinds.filter((x) => x.kind === k.kind).map((x) => x.label[1])))].join(" / ") });
    kinds.value = this.kind;
    const list = el.createDiv();
    const fill = () => this.table(list);
    search.oninput = () => { this.query = search.value; fill(); };
    kinds.onchange = () => { this.kind = kinds.value; fill(); };
    rules.onchange = () => { this.rules = rules.value; fill(); };
    fill();
  }

  /** The entries matching the search and kind, by kind (in the ruleset's order) and name. */
  private table(el: HTMLElement) {
    el.empty();
    const { plugin } = this, q = lc(this.query.trim());
    const kindOf = (e: CustomEntry) => RULESETS.find((r) => r.id === e.ruleset)?.kinds.find((k) => k.kind === e.kind) ?? null;
    const order = (e: CustomEntry) => RULESETS[0].kinds.findIndex((k) => k.kind === e.kind);
    const entries = plugin.customFile.entries.filter((e) => (!this.rules || e.ruleset === this.rules) && (!this.kind || e.kind === this.kind) && (!q || lc(e.name).includes(q)))
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    if (!entries.length) { el.createEl("p", { cls: "dnd-hint", text: "No entries match." }); return; }
    const t = el.createDiv({ cls: "dnd-report-scroll" }).createEl("table", { cls: "dnd-report-entries" });
    const h = t.createEl("thead").createEl("tr");
    for (const label of ["Name", "Rules", "Type", "Details", "Note", ""]) h.createEl("th", { text: label });
    const body = t.createEl("tbody");
    for (const e of entries) this.row(body, e, kindOf(e));
  }

  private row(body: HTMLElement, e: CustomEntry, def: KindDef | null) {
    const { plugin } = this;
    const tr = body.createEl("tr", { cls: def ? "" : "is-left-out" });
    tr.createEl("td", { text: e.name });
    tr.createEl("td", { text: RULESETS.find((r) => r.id === e.ruleset)?.label ?? e.ruleset });
    tr.createEl("td", { text: def?.label[0] ?? e.kind });
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
      act("pencil", "Edit", () => new EntryModal(plugin.app, plugin, def, e, () => this.redraw(), false, e.ruleset).open());
      act("copy", "Make a copy", () => new EntryModal(plugin.app, plugin, def, e, () => this.redraw(), true, e.ruleset).open());
    }
    act("trash-2", "Delete", () => new ConfirmModal(plugin.app, `Delete ${e.name}?`,
      "Sheets that use it keep it by name only, and lose what it gave them. This can't be undone.", "Delete", async () => {
        await plugin.deleteCustomEntry(e.id);
        new Notice(`Deleted ${e.name}.`);
        this.redraw();
      }).open(), "mod-warning");
  }

  /** "+ New entry": the kind first, then its form, which starts with the rules of new characters or else rules it can be made with. */
  private create() {
    const { plugin } = this, main = plugin.settings.defaultRuleset;
    const order = [...RULESETS].sort((a, b) => Number(b.id === main) - Number(a.id === main));
    const ctxOf = (id: string) => { const c = plugin.contextById(id); return { data: c.manual ? c.customOnly : c.rules.data }; };
    const startingRules = (kind: string) => order.find((r) => !r.kinds.find((k) => k.kind === kind)?.available?.(ctxOf(r.id)));
    new Picker(plugin.app, rulesetById(main).kinds, (k) => k.label[0], (k) => {
      const rules = startingRules(k.kind);
      if (!rules) { new Notice(k.available?.(ctxOf(main)) ?? ""); return; }
      const def = rules.kinds.find((x) => x.kind === k.kind)!;
      window.setTimeout(() => new EntryModal(plugin.app, plugin, def, null, () => this.redraw(), false, rules.id).open(), 0);
    }, "What do you want to create?", (k) => (startingRules(k.kind) ? "" : k.available?.(ctxOf(main)) ?? "")).open();
  }

  /** set by the page that shows this view: draws it again after a change */
  redraw: () => void = () => {};
}

/** Asks before doing something that can't be undone. */
