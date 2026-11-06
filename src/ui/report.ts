import { App, Modal, Setting } from "obsidian";
import { ENTRY_KINDS } from "../data/build";
import type { BrewEntry } from "../data/build";
import type { Counts, FileReport, ImportReport } from "../data/report";
import { KIND_LABELS as KIND } from "../data/entries";

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * What an import brought in, as a table: a row for the 5etools data and one for each homebrew file,
 * with how many entries of each kind came from it and how many it had that were left out. A homebrew
 * file's row opens to list its entries, with their kind and whether they were imported (or why not).
 */
export class ImportReportModal extends Modal {
  /** `reports`: one per edition imported; `otherRules`: homebrew for rules that weren't imported */
  constructor(app: App, private reports: { label: string; report: ImportReport }[], private otherRules: BrewEntry[]) { super(app); }

  onOpen() {
    const { contentEl, otherRules } = this;
    this.modalEl.addClass("dnd-report-modal");
    contentEl.addClass("dnd-report");
    contentEl.createEl("h2", { text: "Import report" });
    if (otherRules.length) {
      const shown = otherRules.slice(0, 5).map((e) => e.name).join(", ");
      contentEl.createDiv({ cls: "dnd-rules-warning", text: `${otherRules.length} homebrew entr${otherRules.length === 1 ? "y is" : "ies are"} for other rules, so left out: ${shown}${otherRules.length > 5 ? "…" : ""}. To use them, set the data source of those rules to imported data and import again.` });
    }
    contentEl.createEl("p", { cls: "dnd-hint", text: "What each edition's data holds, by where it came from. Open a homebrew file to see its entries." });
    for (const { label, report } of this.reports) this.edition(contentEl, label, report);
    new Setting(contentEl).addButton((b) => b.setButtonText("Close").setCta().onClick(() => this.close()));
  }

  /** The report of the data of one edition. */
  private edition(contentEl: HTMLElement, label: string, r: ImportReport) {
    contentEl.createEl("h3", { cls: "dnd-report-edition", text: label });
    const table = contentEl.createDiv({ cls: "dnd-report-scroll" }).createEl("table", { cls: "dnd-report-table" });
    const head = table.createEl("thead").createEl("tr");
    head.createEl("th", { text: "Source" });
    for (const k of ENTRY_KINDS) head.createEl("th", { cls: "dnd-report-num", text: KIND[k][1] });
    head.createEl("th", { cls: "dnd-report-num", text: "Left out" });

    const body = table.createEl("tbody");
    const official = body.createEl("tr");
    const name = official.createEl("td");
    name.createDiv({ text: "5etools data" });
    name.createDiv({ cls: "dnd-hint", text: r.dataFolder ?? "No data folder: only homebrew was imported" });
    this.counts(official, r.official);
    official.createEl("td");
    for (const f of r.files) this.fileRows(body, f);

    const foot = table.createEl("tfoot").createEl("tr");
    foot.createEl("th", { text: "Total" });
    this.counts(foot, r.total, "th");
    this.leftOut(foot, r.files.reduce((a, f) => a + f.leftOut, 0), "th");

    if (r.messages.length) {
      const d = contentEl.createEl("details", { cls: "dnd-report-messages" });
      d.createEl("summary", { text: `Other messages (${r.messages.length})` });
      const ul = d.createEl("ul");
      for (const m of r.messages) ul.createEl("li", { text: m });
    }
  }

  private counts(tr: HTMLElement, c: Counts, tag: "td" | "th" = "td") {
    for (const k of ENTRY_KINDS) tr.createEl(tag, { cls: c[k] ? "dnd-report-num" : "dnd-report-num is-zero", text: String(c[k]) });
  }
  private leftOut(tr: HTMLElement, n: number, tag: "td" | "th" = "td") {
    tr.createEl(tag, { cls: n ? "dnd-report-num is-left-out" : "dnd-report-num is-zero", text: String(n) });
  }

  /** A homebrew file's row, and the row under it with its entries, built when first opened. */
  private fileRows(body: HTMLElement, f: FileReport) {
    const row = body.createEl("tr", { cls: "dnd-report-file" });
    const cell = row.createEl("td");
    const toggle = cell.createEl("button", { cls: "dnd-report-toggle", attr: { "aria-expanded": "false", title: f.file } });
    toggle.createSpan({ cls: "dnd-report-chevron", text: "▸" });
    toggle.createSpan({ text: fileName(f.file) });
    cell.createDiv({ cls: f.error ? "dnd-hint is-left-out" : "dnd-hint", text: f.error ? `Not read: ${f.error}` : f.books.join(", ") });
    this.counts(row, f.imported);
    this.leftOut(row, f.leftOut);

    const detail = body.createEl("tr", { cls: "dnd-report-detail" });
    const td = detail.createEl("td", { attr: { colspan: String(ENTRY_KINDS.length + 2) } });
    detail.hide();
    let built = false;
    const open = () => {
      const opening = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(opening));
      toggle.querySelector(".dnd-report-chevron")?.setText(opening ? "▾" : "▸");
      if (opening && !built) { built = true; this.fileDetail(td, f); }
      if (opening) detail.show(); else detail.hide();
    };
    toggle.onclick = (e) => { e.stopPropagation(); open(); };
    row.onclick = open;
  }

  private fileDetail(el: HTMLElement, f: FileReport) {
    el.createDiv({ cls: "dnd-hint", text: f.file });
    if (f.error) el.createEl("p", { text: `This file could not be read (${f.error}), so nothing came from it.` });
    else if (!f.entries.length) el.createEl("p", { text: "This file has no races, subraces, classes, subclasses, backgrounds, feats, spells or items." });
    else {
      const t = el.createEl("table", { cls: "dnd-report-entries" });
      const h = t.createEl("thead").createEl("tr");
      for (const label of ["Name", "Type", "Source", "Result"]) h.createEl("th", { text: label });
      const b = t.createEl("tbody");
      for (const e of f.entries) {
        const tr = b.createEl("tr", { cls: e.reason == null ? "" : "is-left-out" });
        tr.createEl("td", { text: e.name });
        tr.createEl("td", { text: KIND[e.kind][0] });
        tr.createEl("td", { text: e.source });
        tr.createEl("td", { text: e.reason == null ? "Imported" : `Left out: ${e.reason}` });
      }
    }
    if (f.unused.length) el.createEl("p", { cls: "dnd-hint", text: `Not used by the sheet: ${f.unused.map((u) => `${u.collection} (${u.count})`).join(", ")}.` });
    if (f.messages.length) {
      const ul = el.createEl("ul", { cls: "dnd-report-file-messages" });
      for (const m of f.messages) ul.createEl("li", { text: m });
    }
  }

  onClose() { this.contentEl.empty(); }
}
