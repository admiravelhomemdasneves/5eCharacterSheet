// Skills: proficiency and bonus of each skill, and the skill choices of the class and race.
import { Notice } from "obsidian";
import * as E from "../../rules/engine";
import { fmtMod } from "../../rules/engine";
import { button } from "../widgets";
import { d20 } from "../dice";
import { title } from "../../text";
import type { CharacterSheet } from "../sheet";

export function skills(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v, r = sheet.r;
  sheet.section(root, "skills", "Skills", (el) => {
    const prof = d.skillProf, auto = d.skillSources;
    const list = el.createDiv({ cls: "dnd-skill-list" });
    for (const [k, a] of Object.entries(E.SKILLS)) {
      const row = list.createDiv({ cls: "dnd-skill" });
      const lvl = prof[k];
      const dot = row.createSpan({ cls: `dnd-prof dnd-prof-${lvl}`, text: ["○", "●", "◉"][lvl], attr: { "aria-label": ["Not proficient", "Proficient", "Expertise"][lvl] + " — click to change" } });
      dot.onclick = () => sheet.change((x) => { x.skills[k] = (((lvl + 1) % 3) as E.ProfLevel); });
      const bonus = d.skills[k];
      sheet.rollable(row, fmtMod(bonus), d20(bonus), title(k), "dnd-skill-bonus");
      sheet.link(row, title(k), sheet.plugin.linker.rule("skills", title(k)), "dnd-skill-name");
      row.createSpan({ cls: "dnd-skill-abil", text: a.toUpperCase() });
      if (auto[k]) row.createSpan({ cls: "dnd-skill-src", text: auto[k].join(", ") });
    }
    button(el, "Reset to automatic", () => sheet.change((x) => { x.skills = {}; }), "dnd-small");
    // skill choices from class / race
    s.classes.forEach((e, i) => {
      const c = r.cls(e.id);
      const rule = i === 0 ? c?.skills[0] : c?.multiclass?.skills[0];
      if (!c || !rule) return;
      choiceChips(sheet, el, `${c.name}: choose ${rule.count}`, rule.from === "any" ? Object.keys(E.SKILLS) : rule.from, e.skills, rule.count, (v) => sheet.change((x) => { x.classes[i].skills = v; }));
    });
    const race = r.race(s);
    const rc = race?.skills.choose[0];
    if (rc) choiceChips(sheet, el, `${race.name}: choose ${rc.count}`, rc.from === "any" ? Object.keys(E.SKILLS) : rc.from, s.raceSkills, rc.count, (v) => sheet.change((x) => { x.raceSkills = v; }));
  });
}

export function choiceChips(sheet: CharacterSheet, parent: HTMLElement, label: string, from: string[], chosen: string[], count: number, set: (v: string[]) => void) {
  const box = parent.createDiv({ cls: "dnd-choice" });
  box.createDiv({ cls: "dnd-label", text: `${label} (${chosen.length}/${count})` });
  const chips = box.createDiv({ cls: "dnd-chips" });
  for (const k of from) {
    const on = chosen.includes(k);
    const chip = chips.createSpan({ text: title(k), cls: `dnd-chip ${on ? "is-on" : ""}` });
    chip.onclick = () => { if (on) set(chosen.filter((x) => x !== k)); else if (chosen.length < count) set([...chosen, k]); else new Notice(`You can only choose ${count}.`); };
  }
}
