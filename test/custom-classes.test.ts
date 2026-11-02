import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { newEntryId, type CustomEntry } from "../src/custom/format.ts";
import { mergeCustom } from "../src/custom/merge.ts";
import { RULESET_2014, levelValues } from "../src/rules/5e-2014/custom.ts";
import { srdData } from "./helpers.ts";

const srd: E.Compendium = srdData();
const entry = (kind: string, name: string, data: Record<string, unknown>): CustomEntry =>
  ({ id: newEntryId(`${kind} ${name}`, new Set()), ruleset: "5e-2014", kind, name, data });
const merge = (...entries: CustomEntry[]) => mergeCustom(srd, { version: 1, entries }, RULESET_2014);
const kind = (k: string) => RULESET_2014.kinds.find((x) => x.kind === k)!;
/** values by level as the data keeps counts: 0 before the first */
const nums = (t: string) => levelValues(t).map((v) => (typeof v === "number" ? v : 0));
/** a character of one class at `level`, WIS 14 and CON 12 */
function char(classId: string, level: number, subclass: string | null = null) {
  const s = E.newCharacter("C");
  s.classes = [{ id: classId, subclass, level, hpRolls: [], skills: [] }];
  s.abilities.base = { str: 10, dex: 10, con: 12, int: 10, wis: 14, cha: 10 };
  return s;
}

test("values by level: from a level on, or one per level", () => {
  const v = levelValues("1: 2, 10: 4, 4: 3");
  assert.deepEqual([v[0], v[2], v[3], v[8], v[9], v[19]], [2, 2, 3, 3, 4, 4]);
  assert.deepEqual(levelValues("3: 1d6").slice(0, 4), [null, null, "1d6", "1d6"]);
  assert.deepEqual(levelValues("2, 2, 3").slice(0, 4), [2, 2, 3, null]);
  assert.deepEqual(levelValues("").every((x) => x === null), true);
});

const MYSTIC = entry("class", "Mystic", {
  hd: "10", saves: ["wis", "con"], armor: "light, shield", weapons: "simple", skillChoices: 2, skillChoiceFrom: ["insight", "religion", "arcana"],
  castingAbility: "wis", progression: "full", preparation: "prepared", preparedCount: "half", cantrips: "1: 2, 4: 3",
  subclassTitle: "Mystic Order", subclassLevel: 2,
  features: [{ name: "Inner Calm", level: 1, uses: "pb", rest: "long", text: "Calm." }, { name: "Focus", level: 3, uses: "wis", rest: "short", text: "Focus." }, { name: "", level: 1 }],
  columns: [{ label: "Mind Points", values: "1: 2, 5: 4" }], multiclass: [{ ability: "wis", score: 13 }],
});

test("a custom class: proficiencies, spellcasting, features by level and their uses", () => {
  const { data, warnings } = merge(MYSTIC);
  assert.deepEqual(warnings, []);
  const c = data.classes.find((x) => x.name === "Mystic")!;
  assert.deepEqual([c.hd, c.saves, c.armor, c.weapons, c.skills], [10, ["wis", "con"], ["light", "shield"], ["simple"], [{ from: ["insight", "religion", "arcana"], count: 2 }]]);
  assert.deepEqual(c.spellcasting, { ability: "wis", progression: "full", prepared: "<$level$> / 2 + <$wis_mod$>", cantrips: levelValues("1: 2, 4: 3"), known: null, knownFixed: null, list: "Mystic" });
  assert.deepEqual(c.multiclass?.requirements, { wis: 13 });
  assert.deepEqual(c.features.map((f) => [f.name, f.level, !!f.subclassFeature]), [["Inner Calm", 1, false], ["Mystic Order", 2, true], ["Focus", 3, false]]);
  const r = new E.Rules(data), s = char(c.id, 4);
  const d = E.derive(r, s);
  assert.deepEqual(E.hitDice(r, s), { d10: 4 });
  assert.deepEqual([d.casters[0].prepared, d.casters[0].cantrips, d.slots.max.slice(0, 3)], [4, 3, [4, 3, 0]]);
  assert.deepEqual(d.resources, [
    { key: "Mystic:Mind Points", label: "Mind Points", max: 2 },
    { key: "Mystic:Inner Calm", label: "Inner Calm (long rest)", max: 2 },
    { key: "Mystic:Focus", label: "Focus (short or long rest)", max: 2 },
  ]);
  assert.ok(d.pending.includes("Pick 2 Mystic skill proficiency(ies)"));
});

test("subclasses: of a class of the data, with their features, spells always prepared and spellcasting", () => {
  const fighter = srd.classes.find((c) => c.name === "Fighter")!;
  const before = fighter.subclasses.length;
  const knight = entry("subclass", "Rune Knight", {
    class: fighter.id, features: [{ name: "Rune Ward", level: 3, uses: "2", rest: "short", text: "Ward." }],
    alwaysPrepared: [{ level: 3, spells: "Shield, Magic Missile" }, { level: 7, spells: "Misty Step" }],
    castingAbility: "int", preparation: "known", cantrips: "3: 2", known: "3: 3, 4: 4", spellList: "Wizard",
  });
  const order = entry("subclass", "Order of Stars", { class: MYSTIC.id, features: [{ name: "Starlight", level: 2, text: "Shine." }], castingAbility: "cha" });
  const { data, warnings } = merge(order, knight, MYSTIC, entry("subclass", "Lost", { class: "nobody|phb" }));
  assert.deepEqual(warnings, ["Lost (Subclass): its class (Nobody) is not in the rules data"]);
  assert.equal(fighter.subclasses.length, before, "the data it was merged into keeps its own subclasses");
  const sub = data.classes.find((c) => c.name === "Fighter")!.subclasses.find((x) => x.name === "Rune Knight")!;
  assert.deepEqual(sub.spellcasting, { ability: "int", progression: "1/3", prepared: null, cantrips: nums("3: 2"), known: nums("3: 3, 4: 4"), knownFixed: null, list: "Wizard" });
  assert.deepEqual(data.classes.find((c) => c.name === "Mystic")!.subclasses.map((x) => [x.name, x.spellcasting]), [["Order of Stars", null]], "a caster class's subclass casts with the class");
  const r = new E.Rules(data), s = char(fighter.id, 3, sub.id);
  const d = E.derive(r, s);
  assert.deepEqual(d.granted.map((g) => r.spell(g.id)!.name), ["Shield", "Magic Missile"]);
  assert.deepEqual([d.casters[0].name, d.casters[0].known, d.slots.max[0]], ["Fighter (Rune Knight)", 3, 2]);
  assert.ok(d.features[0].features.some((f) => f.name === "Rune Ward"));
  assert.deepEqual(d.resources.find((x) => x.key === "Fighter:Rune Ward"), { key: "Fighter:Rune Ward", label: "Rune Ward (short or long rest)", max: 2 });
});

test("class features: added to a class or subclass of the data, at their level", () => {
  const { data, warnings } = merge(
    entry("class-feature", "Battle Cry", { of: "fighter|phb", level: 2, uses: "cha", rest: "long", text: "Shout." }),
    entry("class-feature", "Lucky Strike", { of: "fighter|phb>fighter|champion|phb", level: 3, text: "Luck." }),
    entry("class-feature", "Nowhere", { of: "fighter|phb>fighter|gone|phb", level: 3, text: "x" }),
  );
  assert.deepEqual(warnings, ["Nowhere (Class feature): its subclass (Gone) is not in the rules data"]);
  const fighter = data.classes.find((c) => c.name === "Fighter")!;
  assert.deepEqual(fighter.features.find((f) => f.name === "Battle Cry")?.uses, { max: "cha", rest: "long" });
  assert.ok(!srd.classes.find((c) => c.name === "Fighter")!.features.some((f) => f.name === "Battle Cry"), "the data it was merged into is not changed");
  const champion = fighter.subclasses.find((x) => x.name === "Champion")!;
  const s = char(fighter.id, 3, champion.id);
  const d = E.derive(new E.Rules(data), s);
  const names = d.features[0].features.map((f) => f.name);
  assert.ok(names.includes("Battle Cry") && names.includes("Lucky Strike"));
  assert.deepEqual(d.resources.find((x) => x.key === "Fighter:Battle Cry")?.max, 1, "an ability modifier of 0 still gives one use");
  assert.equal(kind("class-feature").summary!(entry("class-feature", "x", { of: "fighter|phb>fighter|champion|phb", level: 3 })), "Fighter (Champion), level 3");
  assert.match(kind("class-feature").available!({ data: { ...data, classes: [] } })!, /classes of the SRD or imported rules data/);
});

test("manual mode: a class, subclass or feature fills the typed fields", () => {
  const s = E.newCharacter("C");
  kind("class").manual!.fill(MYSTIC, s);
  kind("subclass").manual!.fill(entry("subclass", "Order of Stars", { class: MYSTIC.id, features: [{ name: "Starlight", level: 1 }, { name: "Nova", level: 9 }] }), s);
  kind("class-feature").manual!.fill(entry("class-feature", "Battle Cry", {}), s);
  assert.deepEqual(s.manual.classes, [{ name: "Mystic", subclass: "Order of Stars", level: 1 }]);
  assert.deepEqual(s.manual.classFeatures, ["Inner Calm", "Starlight", "Battle Cry"]);
});

test("the long lists of the forms (races, classes) are grouped by book, your own under Custom data", () => {
  const { data } = merge(MYSTIC);
  const f = kind("subclass").fields.find((x) => x.key === "class")!;
  const opts = f.type === "select" && typeof f.options === "function" ? f.options({ data }) : [];
  const groups = opts.map((o) => o.group);
  assert.ok(opts.find((o) => o.label === "Mystic")?.group === "Custom data");
  assert.ok(opts.find((o) => o.label === "Fighter (PHB)")?.group === srd.meta.sources.PHB);
  // each book's options together
  assert.deepEqual(groups.filter((g, i) => g !== groups[i - 1]).length, new Set(groups).size);
});
