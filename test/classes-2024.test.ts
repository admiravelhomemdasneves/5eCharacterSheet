// The 2024 rules: what the classes and the rules of play change, with the wording of the 2024 texts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompendium } from "../src/data/build.ts";
import * as E from "../src/rules/engine.ts";
import { withAdvantage, withPenalty } from "../src/rules/roll.ts";
import { FILES } from "./fixtures/fivetools.ts";

const feature = (name: string, level: number, className: string, text: string) => ({ name, source: "XPHB", srd52: true, className, classSource: "XPHB", level, entries: [text] });
const klass = (name: string, extra: object, features: string[]) => ({ name, source: "XPHB", edition: "one", srd52: true, hd: { faces: 8 }, proficiency: ["dex"], classFeatures: features, ...extra });
const files: Record<string, unknown> = {
  ...FILES,
  "class/index.json": { x: "class-x.json" },
  "class/class-x.json": {
    class: [
      klass("Fighter", {
        featProgression: [{ name: "Fighting Style", category: ["FS"], progression: { 1: 1 } }, { name: "Epic Boon", category: ["EB"], progression: { 19: 1 } }],
        itemMasteriesProgression: { 1: 2, 4: 3 }, primaryAbility: [{ str: true }, { dex: true }], multiclassing: {},
        startingProficiencies: { weapons: ["simple", "martial"] },
        classTableGroups: [{ colLabels: ["Second Wind", "Weapon Mastery"], rows: Array.from({ length: 20 }, () => [2, 3]) }],
      }, ["Fighting Style|Fighter|XPHB|1", "Weapon Mastery|Fighter|XPHB|1", "Ability Score Improvement|Fighter|XPHB|4", "Epic Boon|Fighter|XPHB|19"]),
      klass("Paladin", { casterProgression: "artificer", spellcastingAbility: "cha", preparedSpellsProgression: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15], primaryAbility: [{ str: true, cha: true }], multiclassing: {} }, []),
      klass("Wizard", { casterProgression: "full", spellcastingAbility: "int", preparedSpellsProgression: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25], spellsKnownProgressionFixed: Array.from({ length: 20 }, (_, i) => (i ? 2 : 6)), cantripProgression: Array.from({ length: 20 }, () => 3),
        classTableGroups: [{ colLabels: ["{@filter Cantrips|spells|level=0|class=Wizard}", "{@filter Prepared Spells|spells|level=!0|class=Wizard}"], rows: Array.from({ length: 20 }, () => [3, 4]) }] }, []),
      klass("Rogue", { startingProficiencies: { weapons: ["simple", "Martial weapons that have the {@filter Finesse or Light|items|type=martial weapon|property=finesse;light} property"] } }, []),
      klass("Monk", {}, ["Unarmored Defense|Monk|XPHB|1", "Body and Mind|Monk|XPHB|20"]),
      klass("Barbarian", {}, ["Unarmored Defense|Barbarian|XPHB|1", "Primal Champion|Barbarian|XPHB|20"]),
      klass("Sorcerer", {}, ["Draconic Resilience|Sorcerer|XPHB|3"]),
    ],
    classFeature: [
      feature("Fighting Style", 1, "Fighter", "Choose a feat."), feature("Weapon Mastery", 1, "Fighter", "Mastery."), feature("Ability Score Improvement", 4, "Fighter", "A feat."), feature("Epic Boon", 19, "Fighter", "A boon."),
      feature("Unarmored Defense", 1, "Monk", "While you aren't wearing armor or wielding a {@item Shield|XPHB}, your base {@variantrule Armor Class|XPHB} equals 10 plus your Dexterity and Wisdom modifiers."),
      feature("Body and Mind", 20, "Monk", "Your Dexterity and Wisdom scores increase by 4, to a maximum of 25."),
      feature("Unarmored Defense", 1, "Barbarian", "While you aren't wearing any armor, your base {@variantrule Armor Class|XPHB} equals 10 plus your Dexterity and Constitution modifiers. You can use a {@item Shield|XPHB} and still gain this benefit."),
      feature("Primal Champion", 20, "Barbarian", "You embody primal power. Your Strength and Constitution scores increase by 4, to a maximum of 25."),
      feature("Draconic Resilience", 3, "Sorcerer", "Your {@variantrule Hit Points|XPHB|Hit Point} maximum increases by 3, and it increases by 1 whenever you gain another Sorcerer level."),
    ],
    subclass: [], subclassFeature: [],
  },
  "feats.json": {
    feat: [
      { name: "Archery", source: "XPHB", category: "FS", entries: ["Plus 2."] },
      { name: "Alert", source: "XPHB", category: "O", entries: ["When you roll Initiative, you can add your Proficiency Bonus to the roll."] },
      { name: "Boon of Fate", source: "XPHB", category: "EB", entries: ["A boon."] },
      { name: "Ability Score Improvement", source: "XPHB", category: "G", entries: ["Increase."] },
    ],
  },
  "items-base.json": {
    baseitem: [
      { name: "Longsword", source: "XPHB", edition: "one", type: "M|XPHB", rarity: "none", weaponCategory: "martial", property: ["V|XPHB"], mastery: ["Sap|XPHB"], dmg1: "1d8", dmgType: "S", weapon: true },
      { name: "Rapier", source: "XPHB", edition: "one", type: "M|XPHB", rarity: "none", weaponCategory: "martial", property: ["F|XPHB"], mastery: ["Vex|XPHB"], dmg1: "1d8", dmgType: "P", weapon: true },
    ],
    itemMastery: [{ name: "Sap", source: "XPHB", entries: ["Disadvantage on its next attack."] }, { name: "Vex", source: "XPHB", entries: ["Advantage on your next attack."] }],
  },
};
const data = await buildCompendium({ read: async (p: string) => structuredClone(files[p]), edition: "2024" });
const r = new E.Rules(data, E.PROFILE_2024);
const cls = (name: string) => data.classes.find((c) => c.name === name)!;
function character(name: string, level: number) {
  const s = E.newCharacter("A");
  s.ruleset = "5e-2024";
  s.abilities.method = "manual";
  s.abilities.base = { str: 16, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
  s.classes = [{ id: cls(name).id, subclass: null, level, hpRolls: [], skills: [] }];
  return s;
}
const weapon = (s: E.CharState, name: string) => s.inventory.push({ id: data.items.find((i) => i.name === name)!.id, name, qty: 1, weight: null, equipped: true, attuned: false, notes: "" });

test("prepared spells come from the class table, with the Wizard's spellbook", () => {
  const paladin = E.casters(r, character("Paladin", 5))[0];
  assert.equal(paladin.prepared, 6);
  assert.equal(paladin.known, null);
  const wizard = E.casters(r, character("Wizard", 1))[0];
  assert.equal(wizard.prepared, 4);
  assert.equal(wizard.known, 6);
  assert.equal(E.spellSlots(r, character("Paladin", 1)).max[0], 2, "half casters have slots from level 1");
});

test("the table's counts of what is chosen are not resources", () => {
  assert.deepEqual(cls("Fighter").tableCols.map((c) => c.label), ["Second Wind"]);
  assert.deepEqual(cls("Wizard").tableCols, []);
});

test("Fighting Style is a choice of feats of its category, and an Epic Boon a slot in the Feats section", () => {
  const ch = cls("Fighter").choices!.find((c) => c.name === "Fighting Style")!;
  assert.equal(ch.feature, "Fighting Style");
  assert.deepEqual(ch.options!.map((o) => o.name), ["Archery"]);
  assert.ok(!cls("Fighter").choices!.some((c) => c.name === "Epic Boon"));
  assert.equal(E.asiSlots(r, character("Fighter", 18)), 1);
  assert.equal(E.asiSlots(r, character("Fighter", 19)), 2);
  assert.equal(E.asiSlots(new E.Rules(data), character("Fighter", 19)), 1, "not in the 2014 rules");
});

test("weapon mastery: picked in the class, said on the weapon's attack, kept by magic versions", () => {
  const ch = cls("Fighter").choices!.find((c) => c.name === "Weapon Mastery")!;
  assert.deepEqual([ch.counts[0], ch.counts[3]], [2, 3]);
  assert.deepEqual(ch.options!.map((o) => o.name), ["Longsword (Sap)", "Rapier (Vex)"]);
  assert.match(ch.options![0].text, /Disadvantage/);
  const s = character("Fighter", 1);
  weapon(s, "Longsword"); weapon(s, "Rapier");
  assert.ok(!E.attacks(r, s)[0].notes.includes("mastery"));
  s.choices[E.featureKey(cls("Fighter").id, "Weapon Mastery")] = ["longsword|xphb"];
  const [sword, rapier] = E.attacks(r, s);
  assert.match(sword.notes, /mastery: Sap/);
  assert.ok(!rapier.notes.includes("mastery"));
});

test("a limited weapon proficiency is about those weapons", () => {
  const s = character("Rogue", 1);
  weapon(s, "Longsword"); weapon(s, "Rapier");
  const [sword, rapier] = E.attacks(r, s);
  assert.match(sword.notes, /not proficient/);
  assert.ok(!rapier.notes.includes("not proficient"));
});

test("multiclassing asks for the primary abilities", () => {
  const scores = E.abilityScores(r, character("Fighter", 1));
  assert.deepEqual(cls("Fighter").multiclass!.requirements, { or: [{ str: 13 }, { dex: 13 }] });
  assert.equal(E.multiclassRequirementsMet(r, cls("Fighter"), scores).ok, true);
  assert.deepEqual(cls("Paladin").multiclass!.requirements, { str: 13, cha: 13 });
  assert.equal(E.multiclassRequirementsMet(r, cls("Paladin"), scores).ok, false);
});

test("exhaustion: -2 to d20 tests when rolled and -5 feet per level, under the 2024 rules only", () => {
  const s = character("Fighter", 1);
  s.exhaustion = 2;
  assert.equal(E.exhaustionPenalty(r, s), 4);
  assert.equal(E.speeds(r, s).walk, 20);
  const old = new E.Rules(data);
  assert.equal(E.exhaustionPenalty(old, s), 0);
  assert.equal(E.speeds(old, s).walk, 30);
  assert.equal(withPenalty("1d20+5", 4), "1d20+5-4");
  assert.equal(withPenalty(withAdvantage("1d20+5", "adv"), 0), "2d20kh1+5");
  assert.equal(withPenalty("2d6+3", 4), "2d6+3");
});

test("a long rest gives back all the hit dice under the 2024 rules", () => {
  const s = character("Fighter", 8);
  s.hitDiceUsed = 7;
  E.longRest(s, 50, 8, E.PROFILE_2024);
  assert.equal(s.hitDiceUsed, 0);
  s.hitDiceUsed = 7;
  E.longRest(s, 50, 8);
  assert.equal(s.hitDiceUsed, 3);
});

test("the 2024 Alert adds the proficiency bonus", () => {
  const s = character("Fighter", 5);
  s.feats = [{ id: "alert|xphb", picks: [], free: true }];
  assert.equal(E.initiative(r, s), 2 + 3);
});

test("rules read from feature texts work with the 2024 wording", () => {
  const monk = character("Monk", 20), barbarian = character("Barbarian", 20), sorcerer = character("Sorcerer", 5);
  const sc = E.abilityScores(r, monk);
  assert.equal(sc.dex.feature, 4);
  assert.equal(sc.wis.max, 25);
  assert.equal(E.armorClass(r, monk).value, 10 + 4 + 5);
  assert.equal(E.abilityScores(r, barbarian).con.feature, 4);
  assert.equal(E.armorClass(r, barbarian).value, 10 + 2 + 4);
  assert.equal(E.hpBreakdown(r, sorcerer).draconic, 5);
});
