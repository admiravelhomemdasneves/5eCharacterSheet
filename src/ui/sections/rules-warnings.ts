// What is wrong between this sheet and its rules (src/rules/conflicts.ts), above everything else on it.
import { RULESETS } from "../../rules/rulesets";
import * as E from "../../rules/engine";
import { ConfirmModal, iconButton } from "../widgets";
import type { CharacterSheet } from "../sheet";

export function rulesWarnings(sheet: CharacterSheet, root: HTMLElement) {
  for (const c of sheet.conflicts()) root.createDiv({ cls: "dnd-rules-warning", text: c.message });
}

/** The rules of the sheet, and the button that changes them. */
export function rulesLabel(sheet: CharacterSheet, parent: HTMLElement) {
  const row = parent.createDiv({ cls: "dnd-rules-label" });
  row.createSpan({ cls: "dnd-tag", text: sheet.ctx.ruleset?.label ?? sheet.ctx.id });
  const other = RULESETS.find((r) => r.id !== sheet.s.ruleset);
  if (other) iconButton(row, "repeat", `Change to ${other.label}`, () => changeRules(sheet, other.id, other.label));
}
function changeRules(sheet: CharacterSheet, to: string, label: string) {
  const target = sheet.plugin.contextById(to), s = sheet.s;
  // a sheet with entries of those rules already (from data with both editions) just moves to them
  const keep = E.unresolvedIds(sheet.r, s).length > 0 && !target.manual && E.unresolvedIds(target.rules, s).length === 0;
  const back = !!s.rulesSnapshots[to];
  const text = keep ? `This sheet's entries are all in the data for ${label}, so they stay.`
    : back ? `The sheet goes back to what it was under ${label}, and what it is now is kept in case you change back.`
      : `Race, background, classes, feats and spells don't carry over between rules: they start empty under ${label}. Nothing is lost: what the sheet is now is kept in it, and changing back brings it back. Name, ability scores, inventory and notes stay.`;
  new ConfirmModal(sheet.app, `Change to ${label}?`, text, "Change rules", async () => { sheet.change((x) => E.changeRules(x, to, keep)); await Promise.resolve(); }).open();
}
