import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { Linker } from "../src/data/links.ts";
import { srdData } from "./helpers.ts";

const srd = srdData();
const r = new E.Rules(srd);

test("bundled SRD data: core content present, attribution included", () => {
  assert.deepEqual(srd.classes.map((c: any) => c.name).sort(), ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]);
  assert.ok(srd.classes.every((c: any) => c.subclasses.length === 1), "one SRD subclass per class");
  assert.ok(srd.races.some((x: any) => x.name === "Dwarf" && x.subraces.some((s: any) => s.name === "Hill")));
  assert.ok(srd.spells.some((x: any) => x.name === "Fireball"));
  assert.match(srd.meta.attribution, /System Reference Document 5\.1.*Creative Commons Attribution 4\.0/s);
});

test("bundled SRD data contains no non-SRD content", () => {
  const text = JSON.stringify(srd);
  for (const word of ["Bladesinging", "School of Divination", "Sage", "Eldritch Knight", "Tasha's Hideous Laughter", "Xanathar", "Hexblade"]) {
    assert.ok(!text.includes(word), `found non-SRD "${word}"`);
  }
  // spells renamed in the SRD use their SRD names
  assert.ok(srd.spells.some((x: any) => x.name === "Hideous Laughter"));
  // no compendium links are baked into the data
  assert.ok(!text.includes("[["), "data must not contain wikilinks");
});

test("SRD sheet works without a compendium (no links)", () => {
  const data = new Linker(null, []).attach(srdData());
  const rr = new E.Rules(data);
  const s = E.newCharacter("Srd");
  const dwarf = data.races.find((x: any) => x.name === "Dwarf");
  s.race = dwarf.id; s.subrace = dwarf.subraces.find((x: any) => x.name === "Hill").id;
  s.abilities.method = "manual";
  s.abilities.base = { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 };
  s.classes = [{ id: data.classes.find((c: any) => c.name === "Wizard").id, subclass: null, level: 5, hpRolls: [], skills: [] }];
  assert.equal(E.hpBreakdown(rr, s).max, 37);
  assert.deepEqual(E.spellSlots(rr, s).max.slice(0, 3), [4, 3, 2]);
  assert.equal(data.races.find((x: any) => x.name === "Dwarf").link, null);
  assert.equal(new Linker(null, []).text("a ⟦spells|Fireball|phb|fireball⟧ b ⟦rule:conditions|Blinded||blinded⟧"), "a fireball b blinded");
});

test("links resolve to compendium notes when they exist", () => {
  const l = new Linker("Comp", [{ path: "Comp/compendium/spells/fireball", alias: "Fireball", source: "phb" }]);
  assert.equal(l.text("cast ⟦spells|fireball|phb|fireball⟧"), "cast [[Comp/compendium/spells/fireball|fireball]]");
  assert.equal(l.text("⟦rule:conditions|Blinded||blinded⟧"), "[[Comp/rules/conditions#Blinded|blinded]]");
  assert.equal(l.text("⟦spells|Shield|phb|shield⟧"), "shield");
});

test("manual mode: typed values, automatic simple maths", () => {
  const s = E.newCharacter("Manual");
  s.abilities.method = "manual";
  s.abilities.base = { str: 10, dex: 16, con: 14, int: 18, wis: 12, cha: 8 };
  s.manual.classes = [{ name: "Wizard", subclass: "Evocation", level: 3 }, { name: "Fighter", subclass: "", level: 2 }];
  s.manual.spellAbility = "int";
  s.saves = { int: 1, wis: 1 };
  s.skills = { arcana: 2 };
  const v = E.manualView(s);
  const rr = new E.Rules({ meta: { sources: {} }, races: [], classes: [], backgrounds: [], feats: [], spells: [], items: [] });
  const sc = E.abilityScores(rr, v);
  assert.equal(E.totalLevel(v), 5);
  assert.equal(E.proficiencyBonus(E.totalLevel(v)), 3);
  assert.equal(E.mod(sc.dex.total), 3);
  assert.equal(E.saveProficiencies(rr, v).int, 1);
  assert.equal(E.skillBonus(rr, v, "arcana", sc), 4 + 6);
  assert.equal(E.skillBonus(rr, v, "perception", sc), 1);
  assert.deepEqual(E.manualCaster(s, sc), { ability: "int", dc: 15, attack: 7 });
  // slots in manual mode are only what the player adds
  v.slots.adjust = [4, 2, 0, 0, 0, 0, 0, 0, 0];
  assert.deepEqual(E.spellSlots(rr, v).max.slice(0, 3), [4, 2, 0]);
});

test("switching modes keeps both sets of fields", () => {
  const s = E.newCharacter("Both");
  s.classes = [{ id: srd.classes[0].id, subclass: null, level: 4, hpRolls: [], skills: [] }];
  s.manual.classes = [{ name: "Homebrew Class", subclass: "", level: 2 }];
  s.manual.race = "Owlfolk";
  const round = E.normalize(JSON.parse(JSON.stringify(s)));
  assert.equal(round.classes[0].level, 4);
  assert.equal(round.manual.classes[0].name, "Homebrew Class");
  assert.equal(round.manual.race, "Owlfolk");
  assert.equal(E.totalLevel(E.manualView(round)), 2);
  assert.equal(E.totalLevel(round), 4);
});

test("current HP never shows above the maximum", () => {
  const s = E.newCharacter("Hp");
  assert.equal(E.currentHp(s, 12), 12); // no value yet = full health
  s.hp.current = 32;
  assert.equal(E.currentHp(s, 7), 7);
  s.hp.current = -3;
  assert.equal(E.currentHp(s, 7), 0);
  s.hp.current = 5;
  assert.equal(E.currentHp(s, 7), 5);
});

test("extra Ability Score Improvements are flagged", () => {
  const s = E.newCharacter("Asi");
  const wizard = srd.classes.find((c: any) => c.name === "Wizard");
  s.classes = [{ id: wizard.id, subclass: null, level: 1, hpRolls: [], skills: [] }];
  s.feats = [{ id: E.ASI_ID, picks: ["int", "dex"] }];
  assert.equal(E.asiSlots(r, s), 0);
  assert.ok(E.pendingChoices(r, s).some((p) => /more than your class levels grant/.test(p)));
  s.classes[0].level = 4;
  assert.ok(!E.pendingChoices(r, s).some((p) => /more than your class levels grant|available/.test(p)));
});

test("prepared-spell formulas are evaluated without eval", () => {
  assert.equal(E.evalFormula("5 + 3"), 8);
  assert.equal(E.evalFormula("5 / 2 + 3"), 5); // half level rounded down + modifier
  assert.equal(E.evalFormula("1 + -1"), 0);
  assert.equal(E.evalFormula("(4 + 2) * 2"), 12);
  assert.equal(E.evalFormula("3 / 0"), null);
  assert.equal(E.evalFormula("alert(1)"), null);
  assert.equal(E.evalFormula("2 +"), null);
});
