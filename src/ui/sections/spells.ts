// Spellcasting: casters, spell slots and the spell list (or what manual mode types in).
import { setIcon } from "obsidian";
import * as E from "../../rules/engine";
import { ABILITIES, type Ability, ABILITY_NAMES, type CharState, fmtMod } from "../../rules/engine";
import { button, checkbox, iconButton, labeled, Picker, select, stepper } from "../widgets";
import { d20 } from "../dice";
import { ORD } from "../format";
import { richText } from "../richtext";
import type { CharacterSheet } from "../sheet";

export function spellcasting(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v;
  const { casters, slots, granted } = d;
  sheet.section(root, "spells", "Spellcasting", (el) => {
    // shown even for characters without spellcasting (Sheet template); hide it from its title
    if (!casters.length && !s.spells.length && !granted.length && !slots.pact) el.createDiv({ cls: "dnd-hint", text: "No spellcasting yet: it appears with a spellcasting class or subclass. You can still add spell slots or spells below." });
    const cs = el.createDiv({ cls: "dnd-casters" });
    for (const c of casters) {
      const box = cs.createDiv({ cls: "dnd-caster" });
      box.createDiv({ cls: "dnd-subtitle", text: c.name });
      const n = d.spellCounts.get(c.classId) ?? { cantrips: 0, levelled: 0, prepared: 0 };
      const line = box.createDiv({ cls: "dnd-row" });
      labeled(line, "Ability").setText(ABILITY_NAMES[c.ability]);
      labeled(line, "Spell Save DC").setText(String(c.dc));
      sheet.rollable(labeled(line, "Spell Attack"), fmtMod(c.attack), d20(c.attack), `${c.name} spell attack`);
      if (c.prepared != null) labeled(line, "Prepared").setText(`${n.prepared} / ${c.prepared}`);
      if (c.cantrips) labeled(line, "Cantrips").setText(`${n.cantrips} / ${c.cantrips}`);
      if (c.known) labeled(line, c.prepared != null ? "Spellbook" : "Spells Known").setText(`${n.levelled} / ${c.known}${c.prepared != null ? "+" : ""}`);
    }
    // slots
    const st = el.createDiv({ cls: "dnd-slots" });
    slotRules(sheet, st.createDiv({ cls: "dnd-subtitle", text: `Spell Slots${slots.casterLevel ? ` (caster level ${slots.casterLevel})` : ""}` }), slots);
    // the computed slots, with the player's adjustment on top
    slotGrid(sheet, st, slots.max, "Add/remove slots of this level", (x, i, v) => { x.slots.adjust[i] += v - slots.max[i]; });
    if (slots.pact) {
      const pc = st.createDiv({ cls: "dnd-slot dnd-pact" });
      pc.createDiv({ cls: "dnd-label", text: `Pact Magic (${ORD[slots.pact.level]} level)` });
      const boxes = pc.createDiv({ cls: "dnd-slot-boxes" });
      for (let k = 0; k < slots.pact.slots; k++) checkbox(boxes, s.slots.pactUsed > k, (v) => sheet.change((x) => { x.slots.pactUsed = v ? k + 1 : k; }));
    }
    // spell list
    const list = el.createDiv({ cls: "dnd-spell-list" });
    const head = list.createDiv({ cls: "dnd-row" });
    head.createDiv({ cls: "dnd-subtitle", text: "Spells" });
    button(head, "+ Add spell", () => addSpell(sheet, casters, slots, false));
    button(head, "+ Any spell", () => addSpell(sheet, casters, slots, true), "dnd-small");
    const rows = d.spells;
    const t = list.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table dnd-spells" });
    const h = t.createEl("tr");
    ["Prep.", "Spell", "Level", "School", "Time", "Range", "", "From", ""].forEach((x) => h.createEl("th", { text: x }));
    spellRows(t, 9, rows, (row) => row.entry.prepared || !!row.granted || row.data!.level === 0, (tr, row) => {
      const sp = row.data!;
      const pc = tr.createEl("td");
      if (row.granted) pc.createSpan({ text: "★", attr: { "aria-label": `Always prepared (${row.granted})` } });
      else if (sp.level === 0) pc.createSpan({ text: "∞", attr: { "aria-label": "Cantrip" } });
      else checkbox(pc, row.entry.prepared, (v) => sheet.change((x) => { const e = x.spells.find((y) => y.id === sp.id); if (e) e.prepared = v; }));
      const nameCell = tr.createEl("td");
      sheet.details(nameCell, (sm) => sheet.link(sm, sp.name, sp.link, "dnd-feature-name"), `*${sp.level ? ORD[sp.level] + "-level" : "Cantrip"} ${sp.school.toLowerCase()}* · ${sp.components} · ${sp.duration}\n\n${sp.text}`);
      tr.createEl("td", { text: sp.level ? ORD[sp.level] : "C" });
      tr.createEl("td", { text: sp.school });
      tr.createEl("td", { text: sp.time });
      tr.createEl("td", { text: sp.range });
      const cr = tr.createEl("td");
      if (sp.concentration) cr.createSpan({ text: "C ", attr: { "aria-label": "Concentration" } });
      if (sp.ritual) cr.createSpan({ text: "R", attr: { "aria-label": "Ritual" } });
      const from = tr.createEl("td");
      if (row.granted) from.setText(row.granted);
      else if (casters.length > 1) select(from, casters.map((c) => ({ value: c.classId, label: c.name })), row.entry.source || "", (v) => sheet.change((x) => { const e = x.spells.find((y) => y.id === sp.id); if (e) e.source = v; }), "—");
      else from.setText(casters.find((c) => c.classId === row.entry.source)?.name || "");
      const del = tr.createEl("td");
      if (!row.granted) iconButton(del, "x", "Remove spell", () => sheet.change((x) => { x.spells = x.spells.filter((y) => y.id !== sp.id); }));
    });
  });
}

// Manual mode: spellcasting ability, slots and a typed spell list (prepared ones first)
export function manualSpellcasting(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v, m = sheet.s.manual;
  sheet.section(root, "spells", "Spellcasting", (el) => {
    const line = el.createDiv({ cls: "dnd-row" });
    select(labeled(line, "Spellcasting Ability"), ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a] })), m.spellAbility, (v) => sheet.change((x) => { x.manual.spellAbility = (v || null) as Ability | null; }), "None");
    const c = E.manualCaster(sheet.s, d.scores);
    if (c) {
      labeled(line, "Spell Save DC").setText(String(c.dc));
      sheet.rollable(labeled(line, "Spell Attack"), fmtMod(c.attack), d20(c.attack), "Spell attack");
    }
    // slots: only what the player adds
    const st = el.createDiv({ cls: "dnd-slots" });
    st.createDiv({ cls: "dnd-subtitle", text: "Spell Slots" });
    slotGrid(sheet, st, s.slots.adjust.map((n) => Math.max(0, n || 0)), "Slots of this level", (x, i, v) => { x.slots.adjust[i] = Math.max(0, v); });
    // spell list
    const list = el.createDiv({ cls: "dnd-spell-list" });
    const head = list.createDiv({ cls: "dnd-row" });
    head.createDiv({ cls: "dnd-subtitle", text: "Spells" });
    button(head, "+ Add spell", () => { sheet.focusItem = `spell:${m.spells.length}`; sheet.change((x) => { x.manual.spells.push({ name: "", level: 1, prepared: false }); }); });
    const order = m.spells.map((sp, i) => ({ sp, i })).sort((a, b) => Number(b.sp.prepared || b.sp.level === 0) - Number(a.sp.prepared || a.sp.level === 0) || a.sp.level - b.sp.level || a.sp.name.localeCompare(b.sp.name));
    const t = list.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table dnd-spells dnd-manual-spells" });
    const h = t.createEl("tr");
    ["Prep.", "Spell", "Level", ""].forEach((x) => h.createEl("th", { text: x }));
    spellRows(t, 4, order, ({ sp }) => sp.prepared || sp.level === 0, (tr, { sp, i }) => {
      const pc = tr.createEl("td");
      if (sp.level === 0) pc.createSpan({ text: "∞", attr: { "aria-label": "Cantrip" } });
      else checkbox(pc, sp.prepared, (v) => sheet.change((x) => { x.manual.spells[i].prepared = v; }));
      const autoEdit = sheet.focusItem === `spell:${i}`;
      if (autoEdit) sheet.focusItem = null;
      richText(sheet, tr.createEl("td"), sp.name, (v) => sheet.change((x) => { x.manual.spells[i].name = v; }), { placeholder: "Spell name (type [[ to link a note)", singleLine: true, autoEdit });
      select(tr.createEl("td"), ORD.map((o, l) => ({ value: String(l), label: o })), String(sp.level), (v) => sheet.change((x) => { x.manual.spells[i].level = parseInt(v) || 0; }), "—");
      iconButton(tr.createEl("td"), "x", "Remove spell", () => sheet.change((x) => { x.manual.spells.splice(i, 1); }));
    });
  });
}

export function addSpell(sheet: CharacterSheet, casters: E.CasterInfo[], slots: E.Derived["slots"], any: boolean) {
  const s = sheet.v, r = sheet.r;
  const lists = new Set(casters.map((c) => c.list).filter(Boolean) as string[]);
  const have = new Set(s.spells.map((x) => x.id));
  const maxLvl = Math.max(0, ...slots.max.map((n, i) => (n ? i + 1 : 0)), slots.pact?.level || 0);
  const items = r.data.spells.filter((sp) => !have.has(sp.id) && (any || ((!lists.size || casters.some((c) => E.onSpellList(c, sp))) && sp.level <= Math.max(maxLvl, 0))));
  new Picker(sheet.app, items, (sp) => `${sp.name} (${sp.level ? ORD[sp.level] : "Cantrip"}, ${sp.source})`, (sp) => sheet.change((x) => {
    const src = casters.find((c) => E.onSpellList(c, sp))?.classId || casters[0]?.classId;
    x.spells.push({ id: sp.id, prepared: false, source: src });
  }), any ? "Search all spells…" : `Search ${[...lists].join("/") || "all"} spells up to ${ORD[maxLvl] || "cantrip"} level…`, (sp) => `${sp.school} · ${sp.classes.join(", ")}`).open();
}

/**
 * An info button after the "Spell Slots" title, with a popup (on hover, or focus for keyboard and touch)
 * of the slots the rules give the character, by level, and the Warlock's pact slots. A level where the
 * sheet has other slots is marked (one stepped down to 0 is only there), the button too, and "Reset"
 * brings the sheet back to the rules. Not shown for characters without slots from their classes.
 */
function slotRules(sheet: CharacterSheet, title: HTMLElement, slots: E.Derived["slots"]) {
  const levels = E.slotsByRules(slots);
  if (!levels.some((l) => l.rules) && !slots.pact) return;
  const differs = levels.some((l) => l.differs);
  const info = title.createSpan({ cls: `dnd-slot-info${differs ? " is-off" : ""}`, attr: { tabindex: "0", role: "button", "aria-haspopup": "true" } });
  setIcon(info.createSpan({ cls: "dnd-slot-info-icon" }), "info");
  // inside the button, so the pointer can move onto it (to press Reset) without closing it
  const line = info.createDiv({ cls: "dnd-slot-rules", attr: { role: "tooltip" } });
  line.createSpan({ cls: "dnd-slot-rules-label", text: "By the rules: " });
  const parts = levels.filter((l) => l.rules || l.differs).map((l) => ({ text: `${ORD[l.level]} ${l.rules}${l.differs ? ` (you have ${l.sheet})` : ""}`, off: l.differs }));
  if (slots.pact) parts.push({ text: `Pact Magic ${slots.pact.slots} × ${ORD[slots.pact.level]}`, off: false });
  parts.forEach((p, i) => {
    if (i) line.appendText(" · ");
    line.createSpan({ text: p.text, cls: p.off ? "dnd-slot-off" : "" });
  });
  if (!differs) return;
  line.appendText(" · ");
  const reset = line.createEl("a", { text: "Reset", href: "#", attr: { "aria-label": "Set the spell slots to what the rules give" } });
  reset.onclick = (e) => {
    e.preventDefault();
    sheet.change((x) => {
      x.slots.adjust = Array<number>(9).fill(0);
      // no more slots used than a level now has
      x.slots.used = x.slots.used.map((u, i) => Math.min(u || 0, slots.base[i]));
    });
  };
}

/**
 * The spell slots of each level that has any, a box per slot (checked: used) and a stepper for how many
 * there are, then a menu to add a slot of any level (one with none comes back that way). `max`: the
 * slots of each level; `setMax` makes a level's `v`. The used slots never exceed a level's new number.
 */
function slotGrid(sheet: CharacterSheet, parent: HTMLElement, max: number[], stepTitle: string, setMax: (x: CharState, i: number, v: number) => void) {
  const s = sheet.v;
  const set = (i: number, v: number) => sheet.change((x) => { setMax(x, i, v); x.slots.used[i] = Math.min(x.slots.used[i] || 0, Math.max(0, v)); });
  const grid = parent.createDiv({ cls: "dnd-slot-grid" });
  for (let i = 0; i < 9; i++) {
    if (!max[i]) continue;
    const cell = grid.createDiv({ cls: "dnd-slot" });
    cell.createDiv({ cls: "dnd-label", text: ORD[i + 1] });
    const boxes = cell.createDiv({ cls: "dnd-slot-boxes" });
    for (let k = 0; k < max[i]; k++) checkbox(boxes, s.slots.used[i] > k, (v) => sheet.change((x) => { x.slots.used[i] = v ? k + 1 : k; }), "Used");
    stepper(cell, max[i], (v) => set(i, v), { min: 0, title: stepTitle });
  }
  select(parent.createDiv({ cls: "dnd-row" }), ORD.slice(1).map((o, i) => ({ value: String(i), label: `${o} level` })), "", (v) => { if (v !== "") set(parseInt(v), max[parseInt(v)] + 1); }, "+ Add a slot of level…");
}

/** The rows of a spell table, `cols` wide: the prepared spells come first, then a "Not prepared" row before the others. */
function spellRows<T>(table: HTMLElement, cols: number, rows: T[], prepared: (row: T) => boolean, build: (tr: HTMLElement, row: T) => void) {
  let lastPrep: boolean | null = null;
  for (const row of rows) {
    const prep = prepared(row);
    if (lastPrep !== null && lastPrep !== prep) table.createEl("tr", { cls: "dnd-sep" }).createEl("td", { attr: { colspan: String(cols) }, text: "Not prepared" });
    lastPrep = prep;
    build(table.createEl("tr", { cls: prep ? "is-prepared" : "" }), row);
  }
}
