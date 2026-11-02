// Feature choices (Fighting Style, Eldritch Invocations, Expertise…): what was picked, shown in the
// feature that explains the choice, or on their own when no feature on the sheet does.
import { Notice } from "obsidian";
import type * as E from "../../rules/engine";
import { button, iconButton, labeled, Picker } from "../widgets";
import { choiceChips } from "./skills";
import type { CharacterSheet } from "../sheet";

const setPicks = (sheet: CharacterSheet, key: string, picks: string[]) => sheet.change((x) => { if (picks.length) x.choices[key] = picks; else delete x.choices[key]; });
const optionName = (c: E.CharChoice, id: string) => c.options.find((o) => o.id === id)?.name ?? id;

/** In a feature's summary: what its choices picked, or how many picks are missing. */
export function choiceTags(sm: HTMLElement, choices: E.CharChoice[]) {
  for (const c of choices) {
    const left = c.count - c.picked.length;
    if (left > 0) sm.createSpan({ cls: "dnd-tag is-pending", text: `choose ${left}` });
    else if (left < 0) sm.createSpan({ cls: "dnd-tag is-pending", text: `${-left} too many` });
    else sm.createSpan({ cls: "dnd-tag", text: c.picked.length <= 3 ? c.picked.map((id) => optionName(c, id)).join(", ") : `${c.picked.length} chosen` });
  }
}

/**
 * The picks of a choice: a menu for a single pick, chips for a few options without text (Expertise,
 * Favored Enemy), else the picked options (each can be read and removed) and a button to choose more.
 * The choices a picked option brings (`all` with this one as parent) follow.
 */
export function choiceBody(sheet: CharacterSheet, el: HTMLElement, c: E.CharChoice, all: E.CharChoice[]) {
  const box = el.createDiv({ cls: "dnd-feature-choice" });
  const unmet = (o: E.OfferedOption) => (o.met ? "" : ` (requires ${o.prereq})`);
  if (c.count === 1 && c.picked.length <= 1 && !c.skills) {
    sheet.pick(labeled(box, c.name), c.options.map((o) => ({ value: o.id, label: o.name + unmet(o), disabled: !o.met && !c.picked.includes(o.id), link: o.link })),
      c.picked[0] ?? null, (v) => setPicks(sheet, c.key, v ? [v] : []), `Choose a ${c.name}…`);
    const o = c.options.find((x) => x.id === c.picked[0]);
    if (o) pickedText(sheet, box, o);
  } else if (c.skills || (c.options.length <= 20 && c.options.every((o) => !o.text))) {
    // chips are the option ids, shown title-cased; one picked before its option went (e.g. a skill no longer proficient) still shows
    const ids = [...c.options.map((o) => o.id), ...c.picked.filter((id) => !c.options.some((o) => o.id === id))];
    choiceChips(sheet, box, `${c.name}: choose ${c.count}`, ids, c.picked, c.count, (v) => setPicks(sheet, c.key, v));
  } else {
    box.createDiv({ cls: "dnd-label", text: `${c.name} (${c.picked.length}/${c.count})` });
    for (const id of c.picked) {
      const o = c.options.find((x) => x.id === id);
      const d = sheet.details(box, (sm) => {
        sheet.link(sm, o?.name ?? id, o?.link, "dnd-feature-name");
        if (o && !o.met) sm.createSpan({ cls: "dnd-tag is-pending", text: `requires ${o.prereq}` });
      }, o?.text ?? "*No longer in the rules data.*", undefined, undefined, `${c.key}#${id}`);
      iconButton(d.querySelector("summary")!.createSpan({ cls: "dnd-feature-btns" }), "x", `Remove ${o?.name ?? id}`, () => setPicks(sheet, c.key, c.picked.filter((p) => p !== id)), "dnd-feature-btn");
    }
    if (c.picked.length < c.count) {
      const items = c.options.filter((o) => !c.picked.includes(o.id));
      button(box.createDiv({ cls: "dnd-row" }), `+ Choose ${c.name} (${c.count - c.picked.length} left)`, () => new Picker(sheet.app, items, (o) => o.name, (o) => {
        if (!o.met) { new Notice(`${o.name} requires ${o.prereq}.`); return; }
        setPicks(sheet, c.key, [...c.picked, o.id]);
      }, `Search ${c.name}…`, (o) => [o.prereq && `${o.met ? "" : "✗ "}Prerequisite: ${o.prereq}`, sheet.sourceName(o.source)].filter(Boolean).join(" · ")).open(), "dnd-small");
    }
  }
  for (const sub of all.filter((x) => x.parent === c.key)) choiceBody(sheet, box, sub, all);
}

/** The text of the option picked in a one-pick choice, with a warning when the character no longer meets its prerequisite. */
function pickedText(sheet: CharacterSheet, el: HTMLElement, o: E.OfferedOption) {
  if (!o.met) el.createDiv({ cls: "dnd-warn", text: `Requires ${o.prereq}.` });
  if (o.text) sheet.md(el, o.text);
}

/** A choice no feature on the sheet explains (e.g. its feature was hidden): on its own, like a feature. */
export function looseChoice(sheet: CharacterSheet, el: HTMLElement, c: E.CharChoice, all: E.CharChoice[], level: boolean) {
  sheet.details(el, (sm) => {
    if (level) sm.createSpan({ cls: "dnd-feature-level", text: `Lv ${c.level}` });
    sm.createSpan({ cls: "dnd-feature-name", text: c.name });
    choiceTags(sm, [c]);
  }, "", undefined, (d) => choiceBody(sheet, d, c, all), c.key);
}
