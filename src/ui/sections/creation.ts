// Character Creation: what the character still has to choose, and what their features grant (spells,
// attacks, uses) for the player to add or dismiss, or that no feature grants any more.
import * as E from "../../rules/engine";
import { filterText, spellMatches } from "../../rules/engine";
import { button, select, Picker } from "../widgets";
import { ORD } from "../format";
import type { CharacterSheet } from "../sheet";

export function creation(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const pending = sheet.manual ? [] : d.pending, suggestions = sheet.manual ? [] : d.suggestions;
  const n = pending.length + suggestions.length;
  if (!n) return;
  sheet.section(root, "creation", `Character Creation — ${n} pending`, (el) => {
    const ul = el.createEl("ul", { cls: "dnd-pending" });
    pending.forEach((p) => ul.createEl("li", { text: p }));
    for (const x of suggestions) suggestion(sheet, ul.createEl("li", { cls: "dnd-suggestion" }), x);
  });
}

function suggestion(sheet: CharacterSheet, li: HTMLElement, x: E.Suggestion) {
  li.createSpan({ text: x.text });
  const btns = li.createSpan({ cls: "dnd-suggestion-btns" });
  const g = x.grant;
  if (x.gone) {
    const gone = x.gone;
    button(btns, "Remove", () => sheet.change((s) => {
      if ("spell" in gone) s.spells = s.spells.filter((e) => e.id !== gone.spell);
      else if ("feat" in gone) s.feats = s.feats.filter((f) => f.grant !== gone.feat);
      else { s.added = s.added.filter((a) => a.key !== gone.added.key); delete s.resources[`grant:${gone.added.key}`]; }
    }), "dnd-small");
    // a spell stays as one of the character's own
    if ("feat" in gone) button(btns, "Keep", () => sheet.change((s) => { const f = s.feats.find((y) => y.grant === gone.feat); if (f) { delete f.grant; delete f.from; } }), "dnd-small");
    if ("spell" in gone) button(btns, "Keep", () => sheet.change((s) => { const e = s.spells.find((y) => y.id === gone.spell); if (e) { delete e.grant; delete e.from; } }), "dnd-small");
    return;
  }
  if (!g) return;
  if (g.kind === "spell") button(btns, "Add", () => sheet.change((s) => { s.spells.push({ id: g.spell!, prepared: true, grant: g.key, from: g.from }); }), "dnd-small");
  else if (g.kind === "spells") button(btns, "Choose…", () => chooseSpell(sheet, g), "dnd-small");
  else if (g.kind === "feat") {
    if (g.feat) button(btns, "Add", () => sheet.change((s) => { E.addGrantedFeat(sheet.r, s, g); }), "dnd-small");
    else button(btns, "Choose…", () => chooseFeat(sheet, g), "dnd-small");
  } else if (g.kind === "variant") select(btns, g.variants!.map((v) => ({ value: v, label: v })), null, (v) => sheet.change((s) => { if (v) s.choices[g.key] = [v]; }), "Spell list…");
  else button(btns, "Add", () => sheet.change((s) => { s.added.push({ key: g.key, kind: g.kind === "resource" ? "resource" : "attack", name: g.name, from: g.from }); }), "dnd-small");
  button(btns, "Dismiss", () => sheet.change((s) => { s.dismissed.push(g.key); }), "dnd-small");
}

/** A feat of the grant's category, added as granted by it. */
function chooseFeat(sheet: CharacterSheet, g: E.Grant) {
  const items = sheet.r.data.feats.filter((f) => f.category === g.category);
  new Picker(sheet.app, items, (f) => `${f.name} (${f.source})`, (f) => sheet.change((s) => { E.addGrantedFeat(sheet.r, s, g, f.id); }), `Search feats (from ${g.from})…`, (f) => (f.prereq ? `Prerequisite: ${f.prereq}` : "")).open();
}

/** A spell of the grant's filter the character doesn't have yet, added as granted by it. */
function chooseSpell(sheet: CharacterSheet, g: E.Grant) {
  const have = new Set(sheet.v.spells.map((e) => e.id));
  const items = sheet.r.data.spells.filter((sp) => !have.has(sp.id) && spellMatches(sp, g.filter!));
  new Picker(sheet.app, items, (sp) => `${sp.name} (${sp.level ? ORD[sp.level] : "Cantrip"}, ${sp.source})`,
    (sp) => sheet.change((s) => { s.spells.push({ id: sp.id, prepared: true, grant: g.key, from: g.from }); }),
    `Search ${filterText(g.filter!, 2)} (from ${g.from})…`, (sp) => `${sp.school} · ${sp.classes.join(", ")}`).open();
}
