// Proficiencies & Languages, Personality & Appearance, and Biography & Diary.
import * as E from "../../rules/engine";
import { labeled } from "../widgets";
import { title } from "../format";
import { bulletList, richText } from "../richtext";
import type { CharacterSheet } from "../sheet";

export function proficiencies(sheet: CharacterSheet, root: HTMLElement) {
  const s = sheet.v, r = sheet.r;
  sheet.section(root, "profs", "Proficiencies & Languages", (el) => {
    const first = s.classes[0] ? r.cls(s.classes[0].id) : null;
    const multi = s.classes.slice(1).map((e) => r.cls(e.id)).filter(Boolean) as E.ClassData[];
    const race = r.race(s), sub = r.subrace(s), bg = r.background(s);
    const auto = {
      armor: [...(first?.armor || []), ...multi.flatMap((c) => c.multiclass?.armor || []), ...(race?.armor.fixed || [])],
      weapons: [...(first?.weapons || []), ...multi.flatMap((c) => c.multiclass?.weapons || []), ...(race?.weapons.fixed || [])],
      tools: [...(first?.tools || []), ...(race?.tools.fixed || []), ...(bg?.tools.fixed || [])],
      languages: [...(race?.languages || []), ...(sub?.languages || []), ...(bg?.languages || [])],
    };
    for (const k of ["armor", "weapons", "tools", "languages"] as const) {
      const f = labeled(el, title(k), "dnd-prof-field");
      const uniq = [...new Set(auto[k].map((x) => x.replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, "$1")))];
      if (uniq.length) f.createDiv({ cls: "dnd-auto", text: uniq.join(", ") });
      richText(sheet, f, s.proficiencies[k], (v) => sheet.change((x) => { x.proficiencies[k] = v; }, false), { placeholder: "Other / chosen…", singleLine: true });
    }
  });
}

export function personality(sheet: CharacterSheet, root: HTMLElement) {
  const s = sheet.v;
  sheet.section(root, "personality", "Personality & Appearance", (el) => {
    const g = el.createDiv({ cls: "dnd-grid-2" });
    for (const k of ["traits", "ideals", "bonds", "flaws"] as const) richText(sheet, labeled(g, title(k === "traits" ? "personality traits" : k), "dnd-rich-field"), s.personality[k], (v) => sheet.change((x) => { x.personality[k] = v; }, false), { placeholder: "Click to write…" });
    const a = el.createDiv({ cls: "dnd-grid-3 dnd-appearance" });
    for (const k of ["age", "height", "weight", "eyes", "skin", "hair"] as const) richText(sheet, labeled(a, title(k)), s.appearance[k], (v) => sheet.change((x) => { x.appearance[k] = v; }, false), { placeholder: "—", singleLine: true });
    richText(sheet, labeled(el, "Allies & Organizations", "dnd-rich-field"), s.allies, (v) => sheet.change((x) => { x.allies = v; }, false), { placeholder: "Click to write… Type [[ to link a note." });
  }, undefined);
}

export function biography(sheet: CharacterSheet, root: HTMLElement) {
  const s = sheet.v;
  sheet.section(root, "biography", "Biography & Diary", (el) => {
    richText(sheet, labeled(el, "Biography", "dnd-rich-field"), s.biography, (v) => sheet.change((x) => { x.biography = v; }, false), { placeholder: "Click to write the background, history, goals… Type [[ to link a note." });
    richText(sheet, labeled(el, "Diary", "dnd-rich-field"), s.diary, (v) => sheet.change((x) => { x.diary = v; }, false), { placeholder: "Click to write session notes… Type [[ to link a note." });
    bulletList(sheet, labeled(el, "Events", "dnd-events"), "events", (x) => x.events, "Describe the event…", "+ Add event");
  });
}
