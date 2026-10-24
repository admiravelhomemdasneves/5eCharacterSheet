// Combat: armour class, initiative, speed, hit points, rests, conditions and senses.
import * as E from "../../rules/engine";
import { fmtMod, mod } from "../../rules/engine";
import { button, checkbox, iconButton, labeled, select, stepper } from "../widgets";
import { d20 } from "../dice";
import type { CharacterSheet } from "../sheet";

export function combat(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v, sc = d.scores;
  const man = sheet.manual, m = sheet.s.manual;
  sheet.section(root, "combat", "Combat", (el) => {
    // manual mode: AC, max HP and speed are typed in instead of computed
    const hp = man ? { max: m.maxHp } : d.hp;
    const ac = man ? { value: m.ac, how: "", stealthDisadvantage: false } : d.ac;
    const cur = E.currentHp(s, hp.max);
    const stats = el.createDiv({ cls: "dnd-combat-stats" });
    const acBox = stats.createDiv({ cls: "dnd-stat" });
    acBox.createDiv({ cls: "dnd-stat-label", text: "Armor Class" });
    acBox.createDiv({ cls: "dnd-stat-value", text: String(ac.value) });
    acBox.createDiv({ cls: "dnd-breakdown", text: ac.how + (ac.stealthDisadvantage ? " · Stealth disadv." : "") });
    if (man) stepper(acBox, m.ac, (v) => sheet.change((x) => { x.manual.ac = v; }), { min: 0, title: "Armor Class" });
    else stepper(acBox, s.ac.adjust, (v) => sheet.change((x) => { x.ac.adjust = v; }), { title: "AC adjustment" });
    const ini = d.initiative;
    const iBox = stats.createDiv({ cls: "dnd-stat" });
    iBox.createDiv({ cls: "dnd-stat-label", text: "Initiative" });
    sheet.rollable(iBox, fmtMod(ini), d20(ini), "Initiative", "dnd-stat-value");
    stepper(iBox, s.initiativeAdjust, (v) => sheet.change((x) => { x.initiativeAdjust = v; }), { title: "Initiative adjustment" });
    const sp: Record<string, number> = man ? { walk: m.speed } : d.speeds;
    const spBox = stats.createDiv({ cls: "dnd-stat dnd-stat-wide" });
    spBox.createDiv({ cls: "dnd-stat-label", text: "Speed" });
    spBox.createDiv({ cls: "dnd-stat-value", text: `${sp.walk} ft.` });
    spBox.createDiv({ cls: "dnd-breakdown", text: Object.entries(sp).filter(([k]) => k !== "walk").map(([k, v]) => `${k} ${v} ft.`).join(", ") });
    if (man) stepper(spBox, m.speed, (v) => sheet.change((x) => { x.manual.speed = v; }), { min: 0, step: 5, title: "Speed" });
    else stepper(spBox, s.speedAdjust, (v) => sheet.change((x) => { x.speedAdjust = v; }), { step: 5, title: "Speed adjustment" });

    // hit points
    const hpEl = el.createDiv({ cls: "dnd-hp" });
    // two-column grid: Current HP | Max HP, Temp HP | Exhaustion, Inspiration | Death Saves
    const hpGrid = hpEl.createDiv({ cls: "dnd-hp-grid" });
    stepper(labeled(hpGrid, "Current HP"), cur, (v) => sheet.change((x) => { x.hp.current = Math.min(v, hp.max); }), { min: 0 });
    if (man) stepper(labeled(hpGrid, "Max HP"), hp.max, (v) => sheet.change((x) => { x.manual.maxHp = v; }), { min: 1 });
    else stepper(labeled(hpGrid, "Max HP"), hp.max, (v) => sheet.change((x) => { x.hp.adjust += v - hp.max; }), { min: 1, title: "Adjusts the computed maximum" });
    stepper(labeled(hpGrid, "Temp HP"), s.hp.temp, (v) => sheet.change((x) => { x.hp.temp = v; }), { min: 0 });
    stepper(labeled(hpGrid, "Exhaustion"), s.exhaustion, (v) => sheet.change((x) => { x.exhaustion = v; }), { min: 0, max: 6 });
    checkbox(labeled(hpGrid, "Inspiration"), s.inspiration, (v) => sheet.change((x) => { x.inspiration = v; }));
    const dsRow = labeled(hpGrid, "Death Saves").createDiv({ cls: "dnd-death" });
    // ︎ asks for the text glyph, not the emoji, so the icons take the accent colour
    dsRow.createSpan({ text: "✔︎", cls: "dnd-death-icon" });
    for (let i = 0; i < 3; i++) checkbox(dsRow, s.deathSaves.success > i, (v) => sheet.change((x) => { x.deathSaves.success = v ? i + 1 : i; }));
    dsRow.createSpan({ text: "✖︎", cls: "dnd-death-icon dnd-death-fail" });
    for (let i = 0; i < 3; i++) checkbox(dsRow, s.deathSaves.fail > i, (v) => sheet.change((x) => { x.deathSaves.fail = v ? i + 1 : i; }));
    sheet.rollable(dsRow, "🎲", "1d20", "Death save");
    // last grid row: Hit Dice | Long Rest
    const hd = man ? E.manualHitDice(m) : d.hitDice;
    const hdTotal = hitDiceTotal(hd, d.level);
    const hdEl = labeled(hpGrid, "Hit Dice used");
    stepper(hdEl, s.hitDiceUsed, (v) => sheet.change((x) => { x.hitDiceUsed = v; }), { min: 0, max: hdTotal, total: hdTotal, title: Object.entries(hd).map(([d, n]) => `${n}${d}`).join(" + ") });
    // manual mode: the hit dice are set in an edit mode, as the ability scores are
    const editing = man && !!sheet.view.editing["hit-dice"];
    if (man) iconButton(hdEl, editing ? "check" : "pencil", editing ? "Done editing" : "Edit hit dice", () => sheet.changeView((v) => { v.editing["hit-dice"] = !editing; }), `dnd-hd-edit${editing ? " is-active" : ""}`);
    button(labeled(hpGrid, "Rest"), "Long Rest", () => sheet.change((x) => E.longRest(x, hp.max, hdTotal)), "dnd-rest-btn");
    if (editing) hitDiceEditor(sheet, hpEl, d.level);
    // roll a hit die (one button per die type when multiclassed)
    const hdRoll = hpEl.createDiv({ cls: "dnd-row dnd-hd-roll" });
    for (const [die, n] of Object.entries(hd)) sheet.rollable(hdRoll, `🎲 Roll ${die}`, `1${die}${fmtMod(mod(sc.con.total))}`, `Hit die (${die})`).setAttr("aria-label", `Roll a hit die: 1${die}${fmtMod(mod(sc.con.total))} (${n}${die} total)`);

    const conds = el.createDiv({ cls: "dnd-chips" });
    for (const c of E.CONDITIONS) {
      const on = s.conditions.includes(c);
      const chip = conds.createSpan({ text: c, cls: `dnd-chip ${on ? "is-on" : ""}` });
      chip.onclick = () => sheet.change((x) => { x.conditions = on ? x.conditions.filter((y) => y !== c) : [...x.conditions, c]; });
    }
    const senses = el.createDiv({ cls: "dnd-hint" });
    const dv = d.darkvision;
    senses.setText([dv ? `Darkvision ${dv} ft.` : "", `Passive Perception ${10 + d.skills.perception}`, `Passive Investigation ${10 + d.skills.investigation}`, `Passive Insight ${10 + d.skills.insight}`, `PB ${fmtMod(d.pb)}`].filter(Boolean).join(" · "));
  });
}

/** How many hit dice there are; with none set (manual mode), as many as the character's level. */
const hitDiceTotal = (hd: Record<string, number>, level: number) => Object.values(hd).reduce((a, b) => a + b, 0) || level;

/**
 * Manual mode: the character's hit dice, each a number of dice of one size (several for a multiclass).
 * With none set the character has as many as their level; "+ Add hit dice" starts there, as d8s.
 */
function hitDiceEditor(sheet: CharacterSheet, parent: HTMLElement, level: number) {
  const m = sheet.s.manual;
  // after a change, no more hit dice used than there are
  const edit = (mutate: (x: E.CharState) => void) => sheet.change((x) => {
    mutate(x);
    x.hitDiceUsed = Math.min(x.hitDiceUsed, hitDiceTotal(E.manualHitDice(x.manual), level));
  });
  const box = parent.createDiv({ cls: "dnd-hd-editor" });
  m.hitDice.forEach((h, i) => {
    const row = box.createDiv({ cls: "dnd-row" });
    stepper(labeled(row, "Hit dice", "dnd-field-narrow"), h.count, (v) => edit((x) => { x.manual.hitDice[i].count = Math.max(1, v); }), { min: 1, title: "How many hit dice of this size" });
    const sizes = E.HIT_DIE_SIDES.includes(h.sides) ? E.HIT_DIE_SIDES : [...E.HIT_DIE_SIDES, h.sides].sort((a, b) => a - b);
    select(labeled(row, "Die"), sizes.map((n) => ({ value: String(n), label: `d${n}` })), String(h.sides), (v) => edit((x) => { x.manual.hitDice[i].sides = parseInt(v) || 8; }));
    iconButton(row, "trash-2", "Remove these hit dice", () => edit((x) => { x.manual.hitDice.splice(i, 1); }));
  });
  const add = box.createDiv({ cls: "dnd-row" });
  button(add, "+ Add hit dice", () => edit((x) => { x.manual.hitDice.push({ count: x.manual.hitDice.length ? 1 : Math.max(1, level), sides: 8 }); }), "dnd-small");
  if (!m.hitDice.length) add.createSpan({ cls: "dnd-hint", text: `None set: ${Math.max(1, level)}, as many as the character's level.` });
}
