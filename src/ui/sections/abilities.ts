// Ability Scores: the six scores and saving throws, and the score editor (method, point buy, racial bonuses).
import { Notice } from "obsidian";
import * as E from "../../rules/engine";
import { ABILITIES, type Ability, ABILITY_NAMES, type CharState, fmtMod, mod } from "../../rules/engine";
import { button, checkbox, iconButton, labeled, select, stepper } from "../widgets";
import { d20 } from "../dice";
import type { CharacterSheet } from "../sheet";

export function abilities(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v, sc = d.scores;
  const editing = !!sheet.view.editing.abilities;
  sheet.section(root, "abilities", "Ability Scores", (el) => {
    const boxes = el.createDiv({ cls: `dnd-abilities${editing ? " is-editing" : ""}` });
    for (const a of ABILITIES) {
      const b = sc[a];
      const box = boxes.createDiv({ cls: "dnd-ability" });
      box.createDiv({ cls: "dnd-ability-name", text: ABILITY_NAMES[a] });
      sheet.rollable(box, fmtMod(mod(b.total)), d20(mod(b.total)), `${ABILITY_NAMES[a]} check`, "dnd-ability-mod");
      if (!editing) { box.createDiv({ cls: "dnd-ability-score", text: String(b.total) }); continue; }
      const edit = box.createDiv({ cls: "dnd-ability-base" });
      // the standard array value is a pick; the editor below adds or removes Adjust on top of it
      if (s.abilities.method === "standard") {
        select(edit, E.STANDARD_ARRAY.map((v) => ({ value: String(v), label: String(v) })), String(s.abilities.base[a]), (v) => sheet.change((x) => { x.abilities.base[a] = parseInt(v) || 8; }), "—");
      }
      // one editor for the whole score: each step goes to base or Adjust (see E.stepAbility)
      stepper(edit, b.total, (v) => sheet.change((x) => E.setAbilityScore(x, a, b.total, v)), { title: `${ABILITY_NAMES[a]} score` });
      const terms: [number, string][] = [[b.race, "race"], [b.asi, "ASI"], [b.feat, "feat"], [b.feature, "class"], [b.adjust, "adj."]];
      const formula = terms.filter(([n]) => n).map(([n, label]) => ` ${n > 0 ? "+" : "−"} ${Math.abs(n)} ${label}`).join("");
      box.createDiv({ cls: "dnd-breakdown", text: `${b.base} base${formula} · max ${b.max}` });
      if (b.over) box.createDiv({ cls: "dnd-warn", text: `Above the maximum of ${b.max}` });
    }
    if (editing) abilityEditor(sheet, el, d);

    // saving throws
    const saves = el.createDiv({ cls: "dnd-saves" });
    saves.createDiv({ cls: "dnd-subtitle", text: "Saving Throws" });
    const prof = d.saves, pb = d.pb;
    const row = saves.createDiv({ cls: "dnd-save-row" });
    for (const a of ABILITIES) {
      const cell = row.createDiv({ cls: "dnd-save" });
      checkbox(cell, prof[a] > 0, (v) => sheet.change((x) => { x.saves[a] = v ? 1 : 0; }), "Proficient");
      const bonus = mod(sc[a].total) + prof[a] * pb;
      cell.createSpan({ text: a.toUpperCase() + " " });
      sheet.rollable(cell, fmtMod(bonus), d20(bonus), `${ABILITY_NAMES[a]} save`);
    }
  }, (actions) => {
    iconButton(actions, editing ? "check" : "pencil", editing ? "Done editing" : "Edit ability scores", () => sheet.changeView((v) => { v.editing.abilities = !editing; v.collapsed.abilities = false; }), editing ? "is-active" : "");
  });
}

// Generation method, point buy and racial bonus choices: only shown in edit mode
export function abilityEditor(sheet: CharacterSheet, el: HTMLElement, d: E.Derived) {
  const s = sheet.v, r = sheet.r;
  {
    const ctl = el.createDiv({ cls: "dnd-row" });
    select(labeled(ctl, "Method"), [
      { value: "pointbuy", label: "Point Buy (27)" }, { value: "standard", label: "Standard Array" },
      { value: "roll", label: "Roll 4d6 (drop lowest)" }, { value: "manual", label: "Manual" },
    ], s.abilities.method, (v) => sheet.change((x) => {
      x.abilities.method = (v || "manual") as CharState["abilities"]["method"];
      if (v === "pointbuy") x.abilities.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
    }));
    if (s.abilities.method === "pointbuy") {
      const pb = E.pointBuySpent(s.abilities.base);
      ctl.createDiv({ cls: pb.valid ? "dnd-hint" : "dnd-warn", text: `Points: ${pb.spent}/27 (${pb.remaining} left)` });
    }
    if (s.abilities.method === "roll") button(ctl, "🎲 Roll all six", () => sheet.change((x) => {
      x.abilities.base = E.rollAbilityScores();
      new Notice(`Rolled: ${ABILITIES.map((a) => `${a.toUpperCase()} ${x.abilities.base[a]}`).join(", ")}`);
    }));
    // racial ability choice
    const opts = E.raceAbilityOptions(r, s);
    if (opts.length) {
      const rc = el.createDiv({ cls: "dnd-row dnd-race-ability" });
      const optIdx = Math.min(s.raceAbility.option, opts.length - 1);
      if (opts.length > 1) select(labeled(rc, "Racial bonus"), opts.map((o, i) => ({ value: String(i), label: o.label })), String(optIdx), (v) => sheet.change((x) => { x.raceAbility = { option: parseInt(v) || 0, picks: [] }; }));
      else labeled(rc, "Racial bonus").setText(opts[0].label || "—");
      const opt = opts[optIdx];
      for (const { from, amount, index } of E.pickSlots(opt.choose)) {
        select(labeled(rc, `+${amount}`), from.map((a) => ({ value: a, label: ABILITY_NAMES[a], disabled: s.raceAbility.picks.includes(a) && s.raceAbility.picks[index] !== a })), s.raceAbility.picks[index] || "", (v) => sheet.change((x) => { x.raceAbility.picks[index] = v as Ability; }), "Choose…");
      }
    }
    const { slots, taken } = d.asi;
    if (slots) el.createDiv({ cls: taken > slots ? "dnd-warn" : "dnd-hint", text: `Ability Score Improvements: ${taken}/${slots} used — add them (or feats) in the Feats section.` });
  }
}
