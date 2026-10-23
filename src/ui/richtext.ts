// Markdown text fields: shown rendered (links with page preview), edited on a click.
import type { CharState } from "../rules/engine";
import { button, iconButton, Picker } from "./widgets";
import type { CharacterSheet } from "./sheet";

/**
 * Editable bullet list: [delete] • text. Enter saves and starts a new item below
 * (Shift+Enter = new line); an item left empty is removed.
 */
export function bulletList(sheet: CharacterSheet, parent: HTMLElement, key: string, items: (s: CharState) => string[], placeholder: string, addLabel: string) {
  const list = parent.createDiv({ cls: "dnd-event-list" });
  items(sheet.s).forEach((text, i) => {
    const row = list.createDiv({ cls: "dnd-event" });
    iconButton(row, "trash-2", "Remove", () => sheet.change((x) => { items(x).splice(i, 1); }));
    row.createSpan({ cls: "dnd-event-bullet", text: "•" });
    const autoEdit = sheet.focusItem === `${key}:${i}`;
    if (autoEdit) sheet.focusItem = null;
    richText(sheet, row, text, (v) => {
      if (!v.trim()) sheet.change((x) => { items(x).splice(i, 1); });
      else sheet.change((x) => { items(x)[i] = v; }, false);
    }, {
      placeholder, inline: true, autoEdit,
      onEnter: (v) => { sheet.focusItem = `${key}:${i + 1}`; sheet.change((x) => { items(x)[i] = v; items(x).splice(i + 1, 0, ""); }); },
    });
  });
  button(parent, addLabel, () => { sheet.focusItem = `${key}:${items(sheet.s).length}`; sheet.change((x) => { items(x).push(""); }); }, "dnd-small");
}

// Markdown text shown rendered (clickable [[links]] with page preview); click it to edit.
// While editing, typing [[ opens a note picker that inserts the link.
export function richText(sheet: CharacterSheet, parent: HTMLElement, initial: string, save: (v: string) => void, o: { placeholder: string; inline?: boolean; singleLine?: boolean; autoEdit?: boolean; onEnter?: (v: string) => void }) {
  let value = initial || "";
  const box = parent.createDiv({ cls: `dnd-richtext${o.inline || o.singleLine ? " is-inline" : ""}${o.singleLine ? " is-single" : ""}` });
  const view = () => {
    box.empty(); box.removeClass("is-editing");
    const v = box.createDiv({ cls: "dnd-richtext-view", attr: { "aria-label": "Click to edit" } });
    if (value.trim()) sheet.md(v, value); else v.createSpan({ cls: "dnd-placeholder", text: o.placeholder });
    v.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a");
      if (a?.hasClass("internal-link")) { e.preventDefault(); void sheet.app.workspace.openLinkText(a.getAttr("data-href") || a.getText(), sheet.sourcePath, e.ctrlKey || e.metaKey); return; }
      if (a) return; // external links open normally
      edit();
    });
    v.addEventListener("mouseover", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("a.internal-link");
      if (a) sheet.app.workspace.trigger("hover-link", { event: e, source: "preview", hoverParent: sheet, targetEl: a, linktext: a.getAttr("data-href") || a.getText(), sourcePath: sheet.sourcePath });
    });
  };
  const edit = () => {
    box.empty(); box.addClass("is-editing");
    const ta = box.createEl("textarea", { cls: "dnd-textarea" });
    ta.value = value;
    autoGrow(ta, o.inline || o.singleLine ? 0 : 72);
    let picking = false, done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      if (commit && ta.value !== value) { value = ta.value; save(value); }
      view();
    };
    ta.addEventListener("blur", () => { if (!picking) finish(true); });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
      else if (o.singleLine && e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (o.onEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); done = true; value = ta.value; o.onEnter(value); }
    });
    ta.addEventListener("input", () => {
      const pos = ta.selectionStart;
      if (ta.value.slice(pos - 2, pos) !== "[[") return;
      picking = true;
      const p = new Picker(sheet.app, sheet.app.vault.getMarkdownFiles(), (f) => f.path.replace(/\.md$/, ""), (f) => {
        ta.setRangeText(`${sheet.app.metadataCache.fileToLinktext(f, sheet.sourcePath, true)}]]`, pos, pos, "end");
      }, "Link to a note…");
      p.onClosed = () => { picking = false; ta.focus(); ta.dispatchEvent(new Event("input")); };
      p.open();
    });
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  if (o.autoEdit) edit(); else view();
  return box;
}

// textarea that grows with its content instead of scrolling
function autoGrow(t: HTMLTextAreaElement, min = 96) {
  const fit = () => { t.setCssStyles({ height: "auto" }); t.setCssStyles({ height: `${Math.max(t.scrollHeight + 2, min)}px` }); };
  t.addEventListener("input", fit);
  window.requestAnimationFrame(fit);
  return t;
}
