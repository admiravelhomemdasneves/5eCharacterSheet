// Spellcasting: casters, spell slots and the spell list (or what manual mode types in).
import * as E from "../../rules/engine";
import { ABILITIES, type Ability, ABILITY_NAMES, fmtMod } from "../../rules/engine";
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
    st.createDiv({ cls: "dnd-subtitle", text: `Spell Slots${slots.casterLevel ? ` (caster level ${slots.casterLevel})` : ""}` });
    const grid = st.createDiv({ cls: "dnd-slot-grid" });
    for (let i = 0; i < 9; i++) {
      const max = slots.max[i];
      if (!max && !s.slots.adjust[i] && !(i < 9 && slots.max.slice(i).some((n) => n > 0))) continue;
      const cell = grid.createDiv({ cls: "dnd-slot" });
      cell.createDiv({ cls: "dnd-label", text: ORD[i + 1] });
      const boxes = cell.createDiv({ cls: "dnd-slot-boxes" });
      for (let k = 0; k < max; k++) checkbox(boxes, s.slots.used[i] > k, (v) => sheet.change((x) => { x.slots.used[i] = v ? k + 1 : k; }), "Used");
      stepper(cell, max, (v) => sheet.change((x) => { x.slots.adjust[i] += v - max; }), { min: 0, title: "Add/remove slots of sheet level" });
    }
    const addLvl = st.createDiv({ cls: "dnd-row" });
    select(addLvl, ORD.slice(1).map((o, i) => ({ value: String(i), label: `${o} level` })), "", (v) => { if (v !== "") sheet.change((x) => { x.slots.adjust[parseInt(v)] += 1; }); }, "+ Add a slot of level…");
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
    let lastPrep: boolean | null = null;
    for (const row of rows) {
      const sp = row.data!;
      const prep = row.entry.prepared || !!row.granted || sp.level === 0;
      if (lastPrep !== null && lastPrep !== prep) { const sep = t.createEl("tr", { cls: "dnd-sep" }); sep.createEl("td", { attr: { colspan: "9" }, text: "Not prepared" }); }
      lastPrep = prep;
      const tr = t.createEl("tr", { cls: prep ? "is-prepared" : "" });
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
    }
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
    const grid = st.createDiv({ cls: "dnd-slot-grid" });
    const max = s.slots.adjust.map((n) => Math.max(0, n || 0));
    for (let i = 0; i < 9; i++) {
      if (!max[i] && !max.slice(i).some((n) => n > 0)) continue;
      const cell = grid.createDiv({ cls: "dnd-slot" });
      cell.createDiv({ cls: "dnd-label", text: ORD[i + 1] });
      const boxes = cell.createDiv({ cls: "dnd-slot-boxes" });
      for (let k = 0; k < max[i]; k++) checkbox(boxes, s.slots.used[i] > k, (v) => sheet.change((x) => { x.slots.used[i] = v ? k + 1 : k; }), "Used");
      stepper(cell, max[i], (v) => sheet.change((x) => { x.slots.adjust[i] = Math.max(0, v); }), { min: 0, title: "Slots of sheet level" });
    }
    select(st.createDiv({ cls: "dnd-row" }), ORD.slice(1).map((o, i) => ({ value: String(i), label: `${o} level` })), "", (v) => { if (v !== "") sheet.change((x) => { x.slots.adjust[parseInt(v)] = Math.max(0, x.slots.adjust[parseInt(v)] || 0) + 1; }); }, "+ Add a slot of level…");
    // spell list
    const list = el.createDiv({ cls: "dnd-spell-list" });
    const head = list.createDiv({ cls: "dnd-row" });
    head.createDiv({ cls: "dnd-subtitle", text: "Spells" });
    button(head, "+ Add spell", () => { sheet.focusItem = `spell:${m.spells.length}`; sheet.change((x) => { x.manual.spells.push({ name: "", level: 1, prepared: false }); }); });
    const order = m.spells.map((sp, i) => ({ sp, i })).sort((a, b) => Number(b.sp.prepared || b.sp.level === 0) - Number(a.sp.prepared || a.sp.level === 0) || a.sp.level - b.sp.level || a.sp.name.localeCompare(b.sp.name));
    const t = list.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table dnd-spells dnd-manual-spells" });
    const h = t.createEl("tr");
    ["Prep.", "Spell", "Level", ""].forEach((x) => h.createEl("th", { text: x }));
    let lastPrep: boolean | null = null;
    for (const { sp, i } of order) {
      const prep = sp.prepared || sp.level === 0;
      if (lastPrep !== null && lastPrep !== prep) { const sep = t.createEl("tr", { cls: "dnd-sep" }); sep.createEl("td", { attr: { colspan: "4" }, text: "Not prepared" }); }
      lastPrep = prep;
      const tr = t.createEl("tr", { cls: prep ? "is-prepared" : "" });
      const pc = tr.createEl("td");
      if (sp.level === 0) pc.createSpan({ text: "∞", attr: { "aria-label": "Cantrip" } });
      else checkbox(pc, sp.prepared, (v) => sheet.change((x) => { x.manual.spells[i].prepared = v; }));
      const autoEdit = sheet.focusItem === `spell:${i}`;
      if (autoEdit) sheet.focusItem = null;
      richText(sheet, tr.createEl("td"), sp.name, (v) => sheet.change((x) => { x.manual.spells[i].name = v; }), { placeholder: "Spell name (type [[ to link a note)", singleLine: true, autoEdit });
      select(tr.createEl("td"), ORD.map((o, l) => ({ value: String(l), label: o })), String(sp.level), (v) => sheet.change((x) => { x.manual.spells[i].level = parseInt(v) || 0; }), "—");
      iconButton(tr.createEl("td"), "x", "Remove spell", () => sheet.change((x) => { x.manual.spells.splice(i, 1); }));
    }
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
