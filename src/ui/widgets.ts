// Small DOM helpers shared by the sheet. Everything is plain Obsidian DOM API (createEl/createDiv).
import { App, FuzzySuggestModal, TFile, setIcon } from "obsidian";

export interface Opt { value: string; label: string; group?: string; disabled?: boolean }

export function select(parent: HTMLElement, opts: Opt[], value: string | null, onChange: (v: string) => void, placeholder = "—", cls = "") {
  const el = parent.createEl("select", { cls: `dnd-select dropdown ${cls}` });
  el.createEl("option", { text: placeholder, value: "" });
  const groups = new Map<string, HTMLElement>();
  for (const o of opts) {
    let host: HTMLElement = el;
    if (o.group) {
      if (!groups.has(o.group)) groups.set(o.group, el.createEl("optgroup", { attr: { label: o.group } }));
      host = groups.get(o.group)!;
    }
    const op = host.createEl("option", { text: o.label, value: o.value });
    if (o.disabled) op.disabled = true;
  }
  el.value = value ?? "";
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

// Custom dropdown: native <select> options give no hover events, so options that link to a
// compendium note are rendered as elements that can trigger Obsidian's page preview on hover.
export interface RichOpt extends Opt { link?: string | null }
export function richSelect(parent: HTMLElement, opts: RichOpt[], value: string | null, onChange: (v: string) => void, o: {
  placeholder?: string; cls?: string; disabled?: boolean; allowEmpty?: boolean;
  hover?: (ev: MouseEvent, target: HTMLElement, link: string) => void;
  onClose?: () => void;
} = {}) {
  const current = opts.find((x) => x.value === value);
  const btn = parent.createEl("button", { cls: `dnd-rich-select dropdown ${o.cls || ""}`, text: current?.label ?? o.placeholder ?? "—" });
  if (!current) btn.addClass("is-placeholder");
  btn.disabled = !!o.disabled;
  btn.onclick = (e) => {
    e.preventDefault();
    if (document.querySelector(".dnd-dropdown")) return;
    const pop = document.body.createDiv({ cls: "dnd-dropdown menu" });
    const rect = btn.getBoundingClientRect();
    pop.setCssStyles({ left: `${Math.min(rect.left, window.innerWidth - 340)}px` });
    const below = window.innerHeight - rect.bottom;
    if (below < 260 && rect.top > below) pop.setCssStyles({ bottom: `${window.innerHeight - rect.top + 2}px` });
    else pop.setCssStyles({ top: `${rect.bottom + 2}px` });
    pop.setCssStyles({ maxHeight: `${Math.max(200, Math.min(420, below < 260 && rect.top > below ? rect.top - 10 : below - 10))}px` });
    const search = pop.createEl("input", { type: "text", placeholder: "Search…", cls: "dnd-dropdown-search" });
    const list = pop.createDiv({ cls: "dnd-dropdown-list" });
    let items: { el: HTMLElement; opt: RichOpt }[] = [];
    let active = -1;
    // The page preview is tied to the hovered option (so Obsidian keeps it open while the option is
    // hovered), then moved beside the menu — right if there is room, else left — instead of over it.
    let hoveredItem: HTMLElement | null = null;
    const placePreview = (preview: HTMLElement) => {
      if (!hoveredItem) return;
      const pr = pop.getBoundingClientRect(), ir = hoveredItem.getBoundingClientRect();
      const w = preview.offsetWidth, h = preview.offsetHeight, gap = 8;
      const left = window.innerWidth - pr.right - gap >= w ? pr.right + gap : Math.max(gap, pr.left - gap - w);
      const top = Math.max(gap, Math.min(ir.top, window.innerHeight - h - gap));
      const l = `${Math.round(left)}px`, t = `${Math.round(top)}px`;
      // only write when different, so our own style change doesn't re-trigger the observer forever
      if (preview.style.left !== l || preview.style.top !== t) preview.setCssStyles({ left: l, top: t, right: "auto", bottom: "auto" });
    };
    const watched = new Set<HTMLElement>();
    const styleObserver = new MutationObserver((muts) => muts.forEach((m) => placePreview(m.target as HTMLElement)));
    const bodyObserver = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => {
        if (!n.instanceOf(HTMLElement) || !n.matches(".popover.hover-popover") || watched.has(n)) return;
        watched.add(n);
        placePreview(n);
        styleObserver.observe(n, { attributes: true, attributeFilter: ["style"] }); // Obsidian re-positions after loading content
      });
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true }); // only while the menu is open
    const close = () => { bodyObserver.disconnect(); styleObserver.disconnect(); pop.remove(); o.onClose?.(); document.removeEventListener("mousedown", outside, true); };
    const outside = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      if (!pop.contains(t) && !t.closest(".popover.hover-popover")) close();
    };
    const pick = (opt: RichOpt) => { close(); if (opt.value !== (value ?? "")) onChange(opt.value); };
    const setActive = (i: number) => {
      items.forEach((x, k) => x.el.toggleClass("is-active", k === i));
      active = i;
      items[i]?.el.scrollIntoView({ block: "nearest" });
    };
    const draw = (q: string) => {
      list.empty(); items = []; active = -1;
      const all: RichOpt[] = o.allowEmpty !== false ? [{ value: "", label: o.placeholder ?? "—" }, ...opts] : opts;
      const ql = q.toLowerCase();
      let group: string | undefined = "\u0000";
      for (const opt of all) {
        if (ql && !opt.label.toLowerCase().includes(ql)) continue;
        if (opt.group !== group) { group = opt.group; if (group) list.createDiv({ cls: "dnd-dropdown-group", text: group }); }
        const el = list.createDiv({ cls: `dnd-dropdown-item menu-item${opt.value === (value ?? "") ? " is-selected" : ""}${opt.disabled ? " is-disabled" : ""}`, text: opt.label });
        if (opt.link) el.createSpan({ cls: "dnd-dropdown-book", text: "📖" });
        if (!opt.disabled) el.onclick = () => pick(opt);
        if (opt.link && o.hover) el.addEventListener("mouseover", (ev) => { hoveredItem = el; o.hover!(ev, el, opt.link!); });
        items.push({ el, opt });
      }
      if (!items.length) list.createDiv({ cls: "dnd-hint", text: "No matches" });
    };
    draw("");
    search.addEventListener("input", () => draw(search.value));
    search.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); close(); }
      else if (ev.key === "ArrowDown") { ev.preventDefault(); setActive(Math.min(items.length - 1, active + 1)); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive(Math.max(0, active - 1)); }
      else if (ev.key === "Enter") { ev.preventDefault(); const it = items[active] ?? items.find((x) => x.opt.value); if (it && !it.opt.disabled) pick(it.opt); }
    });
    window.setTimeout(() => { document.addEventListener("mousedown", outside, true); search.focus(); list.querySelector(".is-selected")?.scrollIntoView({ block: "center" }); }, 0);
  };
  return btn;
}

// `total` shows the value as "value/total" (e.g. hit dice used: 1/5); the field still edits the value
export function stepper(parent: HTMLElement, value: number, onChange: (v: number) => void, o: { min?: number; max?: number; step?: number; cls?: string; title?: string; total?: number } = {}) {
  const wrap = parent.createDiv({ cls: `dnd-stepper ${o.cls || ""}` });
  const clamp = (n: number) => Math.max(o.min ?? -Infinity, Math.min(o.max ?? Infinity, n));
  const show = (n: number) => (o.total != null ? `${n}/${o.total}` : String(n));
  const minus = wrap.createEl("button", { text: "−", cls: "dnd-step" });
  const input = wrap.createEl("input", { type: o.total != null ? "text" : "number", value: show(value ?? 0), cls: o.total != null ? "dnd-fraction" : "" });
  if (o.title) input.title = o.title;
  if (o.total != null) {
    // edit just the number: drop the "/total" while focused
    input.addEventListener("focus", () => { input.value = String(parseInt(input.value) || 0); input.select(); });
    input.addEventListener("blur", () => { input.value = show(parseInt(input.value) || 0); });
  }
  const plus = wrap.createEl("button", { text: "+", cls: "dnd-step" });
  const commit = (n: number) => { n = clamp(n); input.value = show(n); onChange(n); };
  minus.onclick = (e) => { e.preventDefault(); commit((parseInt(input.value) || 0) - (o.step || 1)); };
  plus.onclick = (e) => { e.preventDefault(); commit((parseInt(input.value) || 0) + (o.step || 1)); };
  input.addEventListener("change", () => commit(parseInt(input.value) || 0));
  return wrap;
}

export function textInput(parent: HTMLElement, value: string, onChange: (v: string) => void, placeholder = "", cls = "") {
  const el = parent.createEl("input", { type: "text", value: value || "", placeholder, cls: `dnd-text ${cls}` });
  el.addEventListener("change", () => onChange(el.value));
  return el;
}
export function textArea(parent: HTMLElement, value: string, onChange: (v: string) => void, placeholder = "") {
  const el = parent.createEl("textarea", { placeholder, cls: "dnd-textarea" });
  el.value = value || "";
  el.addEventListener("change", () => onChange(el.value));
  return el;
}
export function checkbox(parent: HTMLElement, checked: boolean, onChange: (v: boolean) => void, title = "") {
  const el = parent.createEl("input", { type: "checkbox", cls: "dnd-check" });
  el.checked = !!checked;
  if (title) el.title = title;
  el.addEventListener("change", () => onChange(el.checked));
  return el;
}
export function iconButton(parent: HTMLElement, icon: string, title: string, onClick: () => void, cls = "") {
  const b = parent.createEl("button", { cls: `dnd-icon-btn clickable-icon ${cls}`, attr: { "aria-label": title } });
  setIcon(b, icon);
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
  return b;
}
export function button(parent: HTMLElement, text: string, onClick: () => void, cls = "") {
  const b = parent.createEl("button", { text, cls: `dnd-btn ${cls}` });
  b.onclick = (e) => { e.preventDefault(); onClick(); };
  return b;
}
export function labeled(parent: HTMLElement, label: string, cls = "") {
  const w = parent.createDiv({ cls: `dnd-field ${cls}` });
  w.createDiv({ cls: "dnd-label", text: label });
  return w.createDiv({ cls: "dnd-value" });
}

// Searchable picker (Ctrl+P style) used for spells, items, feats and images
export class Picker<T> extends FuzzySuggestModal<T> {
  constructor(app: App, private items: T[], private text: (t: T) => string, private choose: (t: T) => void, placeholder: string, private detail?: (t: T) => string) {
    super(app);
    this.setPlaceholder(placeholder);
    this.limit = 200;
  }
  getItems() { return this.items; }
  getItemText(t: T) { return this.text(t); }
  onChooseItem(t: T) { this.choose(t); }
  // runs after the modal closes (Obsidian closes before calling onChooseItem, so defer a tick)
  onClosed?: () => void;
  onClose() { super.onClose(); if (this.onClosed) window.setTimeout(this.onClosed, 0); }
  renderSuggestion(m: { item: T }, el: HTMLElement) {
    el.createDiv({ text: this.text(m.item) });
    if (this.detail) el.createDiv({ text: this.detail(m.item), cls: "dnd-suggest-detail" });
  }
}

export function imageFiles(app: App): TFile[] {
  return app.vault.getFiles().filter((f) => /^(png|jpe?g|webp|gif|svg|bmp)$/i.test(f.extension));
}
