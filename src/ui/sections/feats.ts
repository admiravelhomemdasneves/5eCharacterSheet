// Feats & Ability Score Improvements.
import * as E from "../../rules/engine";
import { ABILITIES, type Ability, ABILITY_NAMES } from "../../rules/engine";
import { button, iconButton, Picker, select } from "../widgets";
import { bulletList } from "../richtext";
import type { CharacterSheet } from "../sheet";

// Manual mode: the feats are a list the player types
export function manualFeats(sheet: CharacterSheet, root: HTMLElement) {
  sheet.section(root, "feats", "Feats", (el) => bulletList(sheet, el, "feats", (x) => x.manual.feats, "Feat…", "+ Add feat"));
}

export function feats(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v, r = sheet.r;
  const { slots, taken } = d.asi;
  sheet.section(root, "feats", `Feats & Ability Score Improvements${slots || taken ? ` (${taken}/${slots})` : ""}`, (el) => {
    if (taken > slots) el.createDiv({ cls: "dnd-warn", text: `${taken} Ability Score Improvement(s)/feat(s) used, but your class levels grant ${slots || "none yet"}. Remove the extra ones.` });
    else if (slots) el.createDiv({ cls: "dnd-hint", text: `Your class levels grant ${slots} Ability Score Improvement(s). Each can be +2 to one ability, +1 to two, or a feat.` });
    s.feats.forEach((fe, i) => {
      const row = el.createDiv({ cls: "dnd-row" });
      if (fe.id === E.ASI_ID) {
        row.createSpan({ cls: "dnd-feature-name", text: "Ability Score Improvement" });
        for (const idx of [0, 1]) select(row, ABILITIES.map((a) => ({ value: a, label: `+1 ${ABILITY_NAMES[a]}` })), fe.picks[idx] || "", (v) => sheet.change((x) => { x.feats[i].picks[idx] = v as Ability; }), "Ability…");
        iconButton(row, "trash-2", "Remove", () => sheet.change((x) => { x.feats.splice(i, 1); }));
        return;
      }
      const f = r.feat(fe.id);
      if (!f) return;
      sheet.details(row, (sm) => { sheet.link(sm, f.name, f.link, "dnd-feature-name"); if (f.prereq) sm.createSpan({ cls: "dnd-tag", text: f.prereq }); if (fe.free) sm.createSpan({ cls: "dnd-tag", text: "bonus feat" }); }, f.text);
      const opt = f.ability[0];
      for (const { from, amount, index } of E.pickSlots(opt?.choose || [])) {
        select(row, from.map((a) => ({ value: a, label: `+${amount} ${ABILITY_NAMES[a]}` })), fe.picks[index] || "", (v) => sheet.change((x) => { x.feats[i].picks[index] = v as Ability; }), "Ability…");
      }
      iconButton(row, "trash-2", "Remove feat", () => sheet.change((x) => { x.feats.splice(i, 1); }));
    });
    const add = el.createDiv({ cls: "dnd-row" });
    button(add, "+ Ability Score Improvement", () => sheet.change((x) => { x.feats.push({ id: E.ASI_ID, picks: [] }); }));
    // Variant Human / Custom Lineage style bonus feats don't use up an ASI
    const bonusFeat = !!r.race(s)?.feats && !s.feats.some((f) => f.free);
    button(add, bonusFeat ? "+ Add feat (racial bonus feat)" : "+ Add feat", () => new Picker(sheet.app, r.data.feats, (f) => `${f.name} (${f.source})`, (f) => sheet.change((x) => { x.feats.push({ id: f.id, picks: [], free: bonusFeat || undefined }); }), "Search feats…", (f) => f.prereq ? `Prerequisite: ${f.prereq}` : "").open());
  });
}
