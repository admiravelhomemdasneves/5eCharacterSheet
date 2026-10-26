import { App, Modal, Setting } from "obsidian";
import { ENTRY_KINDS, type EntryKind } from "../data/build";
import type { Counts, FileReport, ImportReport } from "../data/report";

const KIND: Record<EntryKind, [one: string, many: string]> = {
  race: ["Race", "Races"], subrace: ["Subrace", "Subraces"], class: ["Class", "Classes"], subclass: ["Subclass", "Subclasses"],
  background: ["Background", "Backgrounds"], feat: ["Feat", "Feats"], spell: ["Spell", "Spells"], item: ["Item", "Items"],
};
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * What an import brought in, as a table: a row for the 5etools data and one for each homebrew file,
 * with how many entries of each kind came from it and how many it had that were left out. A homebrew
 * file's row opens to list its entries, with their kind and whether they were imported (or why not).
 */
export class ImportReportModal extends Modal {
  constructor(app: App, private report: ImportReport) { super(app); }

  onOpen() {
    const { contentEl, report: r } = this;
    this.modalEl.addClass("dnd-report-modal");
    contentEl.addClass("dnd-report");
    contentEl.createEl("h2", { text: "Import report" });
    contentEl.createEl("p", { cls: "dnd-hint", text: r.files.length ? "What came from each source. Open a homebrew file to see its entries." : "What came from the 5etools data." });

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
    new Setting(contentEl).addButton((b) => b.setButtonText("Close").setCta().onClick(() => this.close()));
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
