import { App, FuzzySuggestModal, Notice, Platform, TFile, TFolder, Vault, setIcon } from "obsidian";
import type CharacterSheetPlugin from "../main";
import { ENTRY_KINDS, type EntryKind } from "../data/build";
import { groupByFile, type DataEntry, type EntryGroup } from "../data/entries";
import type { Counts } from "../data/report";
import { lc } from "../text";

const KIND: Record<EntryKind, [one: string, many: string]> = {
  race: ["Race", "Races"], subrace: ["Subrace", "Subraces"], class: ["Class", "Classes"], subclass: ["Subclass", "Subclasses"],
  background: ["Background", "Backgrounds"], feat: ["Feat", "Feats"], spell: ["Spell", "Spells"], item: ["Item", "Items"],
};
/** at most this many entries are listed under a row; the search narrows them down */
const MAX_ROWS = 300;
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The "Import data" settings page: what the imported data holds, by where it came from (the 5etools
 * data, each homebrew file), as in the report after an import. A row opens to list its entries:
 * each one's compendium note can be opened or changed, and an entry can be removed from the data.
 * The rows opened and the search stay while the page is open.
 */
export class ImportDataView {
  private opened = new Set<string | null>();
  private query = "";
  private kind: EntryKind | "" = "";
  constructor(private plugin: CharacterSheetPlugin) {}

  draw(el: HTMLElement) {
    el.empty();
    el.addClass("dnd-report", "dnd-import-data");
    const { plugin } = this, st = plugin.settings, data = plugin.rules.data;
    if (st.dataSource !== "imported" || !st.lastImport) {
      el.createEl("p", { cls: "dnd-hint", text: "Nothing imported yet. Import your 5etools data or homebrew in the rules data settings first." });
      return;
    }
    el.createEl("p", { cls: "dnd-hint", text: "What the imported data holds, by where it came from. Open a row to see its entries: open or change the compendium note of each, or remove it from the data. A removed entry stays out when you import again, until you restore it." });
    if (!data.meta.origins && st.homebrewFiles.length) el.createEl("p", { cls: "dnd-hint is-left-out", text: "This data was imported before the plugin kept track of the homebrew files, so all of it is shown as 5etools data. Import again to see each file." });

    // search and kind filter: they narrow the entries listed under the open rows
    const bar = el.createDiv({ cls: "dnd-import-data-bar" });
    const search = bar.createEl("input", { type: "search", attr: { placeholder: "Search entries", "aria-label": "Search entries" } });
    search.value = this.query;
    const kinds = bar.createEl("select", { cls: "dropdown", attr: { "aria-label": "Kind" } });
    kinds.createEl("option", { value: "", text: "All kinds" });
    for (const k of ENTRY_KINDS) kinds.createEl("option", { value: k, text: KIND[k][1] });
    kinds.value = this.kind;

    const { groups, total } = groupByFile(data, data.meta.origins);
    const table = el.createDiv({ cls: "dnd-report-scroll" }).createEl("table", { cls: "dnd-report-table" });
    const head = table.createEl("thead").createEl("tr");
    head.createEl("th", { text: "Source" });
    for (const k of ENTRY_KINDS) head.createEl("th", { cls: "dnd-report-num", text: KIND[k][1] });
    const body = table.createEl("tbody");
    const fills: (() => void)[] = [];
    for (const g of groups) fills.push(this.groupRows(body, g));
    const foot = table.createEl("tfoot").createEl("tr");
    foot.createEl("th", { text: "Total" });
    this.counts(foot, total, "th");

    // a search opens every row with matches and hides the others; clearing it goes back to the rows opened by hand
    const refill = () => fills.forEach((f) => f());
    search.oninput = () => { this.query = search.value; refill(); };
    kinds.onchange = () => { this.kind = kinds.value as EntryKind | ""; refill(); };

    this.removedList(el);
  }

  private counts(tr: HTMLElement, c: Counts, tag: "td" | "th" = "td") {
    for (const k of ENTRY_KINDS) tr.createEl(tag, { cls: c[k] ? "dnd-report-num" : "dnd-report-num is-zero", text: String(c[k]) });
  }
  private matches(e: DataEntry) {
    const q = lc(this.query.trim());
    return (!this.kind || e.kind === this.kind) && (!q || lc(e.name).includes(q) || lc(e.source).includes(q));
  }

  /** A source's row and the row under it with its entries; returns what fills that row again after a search. */
  private groupRows(body: HTMLElement, g: EntryGroup) {
    const row = body.createEl("tr", { cls: "dnd-report-file" });
    const cell = row.createEl("td");
    const toggle = cell.createEl("button", { cls: "dnd-report-toggle", attr: { title: g.file ?? "" } });
    const chevron = toggle.createSpan({ cls: "dnd-report-chevron" });
    toggle.createSpan({ text: g.file ? fileName(g.file) : "5etools data" });
    cell.createDiv({ cls: "dnd-hint", text: g.file ?? (this.plugin.settings.fivetoolsPath.trim() || "No data folder") });
    this.counts(row, g.counts);

    const detail = body.createEl("tr", { cls: "dnd-report-detail" });
    const td = detail.createEl("td", { attr: { colspan: String(ENTRY_KINDS.length + 1) } });
    const fill = () => {
      const filtering = !!this.query.trim() || !!this.kind;
      const shown = filtering ? g.entries.filter((e) => this.matches(e)) : g.entries;
      const open = filtering ? shown.length > 0 : this.opened.has(g.file);
      toggle.setAttribute("aria-expanded", String(open));
      chevron.setText(open ? "▾" : "▸");
      row.toggleClass("is-filtered-out", filtering && !shown.length);
      td.empty();
      if (!open) { detail.hide(); return; }
      detail.show();
      this.entryTable(td, shown);
    };
    const flip = () => {
      // while searching, the rows with matches are the open ones
      if (this.query.trim() || this.kind) return;
      if (this.opened.has(g.file)) this.opened.delete(g.file); else this.opened.add(g.file);
      fill();
    };
    toggle.onclick = (e) => { e.stopPropagation(); flip(); };
    row.onclick = flip;
    fill();
    return fill;
  }

  private entryTable(el: HTMLElement, entries: DataEntry[]) {
    if (!entries.length) { el.createEl("p", { cls: "dnd-hint", text: "No entries." }); return; }
    const t = el.createEl("table", { cls: "dnd-report-entries" });
    const h = t.createEl("thead").createEl("tr");
    for (const label of ["Name", "Type", "Source", "Compendium note", ""]) h.createEl("th", { text: label });
    const b = t.createEl("tbody");
    for (const e of entries.slice(0, MAX_ROWS)) this.entryRow(b, e);
    if (entries.length > MAX_ROWS) el.createEl("p", { cls: "dnd-hint", text: `${entries.length - MAX_ROWS} more: search to find them.` });
  }

  private entryRow(body: HTMLElement, e: DataEntry) {
    const { plugin } = this;
    const tr = body.createEl("tr");
    tr.createEl("td", { text: e.name });
    tr.createEl("td", { text: KIND[e.kind][0] });
    tr.createEl("td", { text: e.source, attr: { title: plugin.rules.data.meta.sources[e.source] ?? "" } });
    const note = tr.createEl("td", { cls: "dnd-import-data-note" });
    const chosen = plugin.settings.noteLinks[e.noteKey];
    if (e.link) {
      const a = note.createEl("a", { cls: "internal-link", text: fileName(e.link), href: e.link, attr: { title: e.link } });
      a.onclick = (ev) => { ev.preventDefault(); void plugin.app.workspace.openLinkText(e.link!, "", Platform.isDesktop ? "window" : "tab"); };
    } else note.createSpan({ cls: "dnd-hint", text: "None" });
    if (chosen != null) note.createSpan({ cls: "dnd-hint", text: " (chosen)" });

    const actions = tr.createEl("td", { cls: "dnd-import-data-actions" });
    const edit = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Change compendium note" } });
    setIcon(edit, "pencil");
    edit.onclick = () => new NoteSuggestModal(plugin.app, plugin.settings.compendiumFolder.trim(), chosen != null, async (path) => {
      await plugin.setNoteLink(e.noteKey, path);
      this.redraw();
    }).open();
    const remove = actions.createEl("button", { cls: "clickable-icon mod-warning", attr: { "aria-label": "Remove from the imported data" } });
    setIcon(remove, "trash-2");
    remove.onclick = async () => {
      await plugin.removeEntries([{ kind: e.kind, name: e.name, source: e.source }]);
      new Notice(`Removed ${e.name} from the imported data. Restore it from the list of removed entries.`);
      this.redraw();
    };
  }

  /** The entries removed by hand: each can be restored, and is back after the next import. */
  private removedList(el: HTMLElement) {
    const { plugin } = this, removed = plugin.settings.removedEntries;
    if (!removed.length) return;
    const d = el.createEl("details", { cls: "dnd-report-messages" });
    d.createEl("summary", { text: `Removed entries (${removed.length})` });
    d.createEl("p", { cls: "dnd-hint", text: "Left out of every import. A restored entry is back after you import again." });
    const ul = d.createEl("ul", { cls: "dnd-import-data-removed" });
    for (const e of removed) {
      const li = ul.createEl("li");
      li.createSpan({ text: `${e.name} ` });
      li.createSpan({ cls: "dnd-hint", text: `${KIND[e.kind][0]}, ${e.source} ` });
      const b = li.createEl("button", { text: "Restore" });
      b.onclick = async () => {
        await plugin.restoreEntries([e]);
        new Notice(`${e.name} will be back after the next import.`);
        this.redraw();
      };
    }
  }

  /** set by the page that shows this view: draws it again after a change */
  redraw: () => void = () => {};
}

type NoteChoice = { label: string; path: string | null };
/**
 * Pick the compendium note of an entry: a note of the compendium folder (else of the whole vault),
 * no note, or back to the one matched by name (only when one was chosen).
 */
class NoteSuggestModal extends FuzzySuggestModal<NoteChoice> {
  constructor(app: App, private root: string, private chosen: boolean, private pick: (path: string | null) => Promise<void>) {
    super(app);
    this.setPlaceholder("Choose the compendium note of this entry");
  }
  getItems(): NoteChoice[] {
    // with a compendium folder only its notes are listed, not the rest of the vault
    const files: TFile[] = [];
    const folder = this.root ? this.app.vault.getAbstractFileByPath(this.root) : null;
    if (folder instanceof TFolder) Vault.recurseChildren(folder, (f) => { if (f instanceof TFile && f.extension === "md") files.push(f); });
    else files.push(...this.app.vault.getMarkdownFiles());
    const notes = files.map((f) => ({ label: f.path.replace(/\.md$/, ""), path: f.path.replace(/\.md$/, "") }));
    return [
      ...this.chosen ? [{ label: "Match by name again (automatic)", path: null }] : [],
      { label: "No note", path: "" },
      ...notes.sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }
  getItemText(item: NoteChoice) { return item.label; }
  onChooseItem(item: NoteChoice) { void this.pick(item.path); }
}
