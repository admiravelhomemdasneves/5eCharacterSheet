import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { srdData } from "./helpers.ts";

const data: any = srdData();
const r = new E.Rules(data);
const byName = (list: any[], name: string) => list.find((x) => x.name === name)!;

// a cleric 3 (Life) / wizard 2 hill dwarf: casters, granted spells, an ASI, armour and a weapon
function character() {
  const s = E.newCharacter("Derive");
  const dwarf = byName(data.races, "Dwarf"), cleric = byName(data.classes, "Cleric"), wizard = byName(data.classes, "Wizard");
  s.race = dwarf.id; s.subrace = byName(dwarf.subraces, "Hill").id;
  s.background = byName(data.backgrounds, "Acolyte").id;
  s.abilities.method = "manual";
  s.abilities.base = { str: 14, dex: 10, con: 14, int: 13, wis: 16, cha: 8 };
  s.classes = [
    { id: cleric.id, subclass: byName(cleric.subclasses, "Life Domain").id, level: 3, hpRolls: [], skills: ["medicine", "history"] },
    { id: wizard.id, subclass: null, level: 2, hpRolls: [], skills: [] },
  ];
  s.feats = [{ id: E.ASI_ID, picks: ["wis"] }];
  s.spells = [
    { id: byName(data.spells, "Guidance").id, prepared: false, source: cleric.id },
    { id: byName(data.spells, "Shield of Faith").id, prepared: true, source: cleric.id },
    { id: byName(data.spells, "Magic Missile").id, prepared: false, source: wizard.id },
  ];
  s.inventory = ["Chain Mail", "Shield", "Warhammer"].map((n) => ({ id: byName(data.items, n).id, name: n, qty: 1, weight: null, equipped: true, attuned: false, notes: "" }));
  return s;
}

test("derive() gives what each calculation gives on its own", () => {
  const s = character(), d = E.derive(r, s), sc = E.abilityScores(r, s);
  assert.deepEqual(d.scores, sc);
  assert.equal(d.level, 5);
  assert.equal(d.pb, 3);
  assert.deepEqual(d.saves, E.saveProficiencies(r, s));
  assert.deepEqual(d.skillSources, E.autoSkillSources(r, s));
  assert.deepEqual(d.skillProf, E.skillProficiencies(r, s));
  for (const k of Object.keys(E.SKILLS)) assert.equal(d.skills[k], E.skillBonus(r, s, k), k);
  assert.deepEqual(d.hp, E.hpBreakdown(r, s));
  assert.deepEqual(d.ac, E.armorClass(r, s));
  assert.equal(d.initiative, E.initiative(r, s));
  assert.deepEqual(d.speeds, E.speeds(r, s));
  assert.deepEqual(d.hitDice, E.hitDice(r, s));
  assert.equal(d.darkvision, E.darkvision(r, s));
  assert.deepEqual(d.features, E.classFeatures(r, s));
  assert.deepEqual(d.resources, E.classResources(r, s));
  assert.deepEqual(d.asi, { slots: E.asiSlots(r, s), taken: E.asiTaken(s) });
  assert.deepEqual(d.casters, E.casters(r, s));
  assert.deepEqual(d.slots, E.spellSlots(r, s));
  assert.deepEqual(d.granted, E.grantedSpells(r, s));
  assert.deepEqual(d.spells, E.sortedSpells(r, s));
  assert.deepEqual(d.attacks, E.attacks(r, s));
  assert.deepEqual(d.pending, E.pendingChoices(r, s));
  // the character is not trivial: these are worked out from real choices
  assert.ok(d.casters.length === 2 && d.granted.length > 0 && d.attacks.length === 1 && d.ac.value === 18);
});

test("caster spell counts: cantrips, levelled spells and the prepared ones, per class", () => {
  const s = character(), d = E.derive(r, s);
  assert.deepEqual(d.spellCounts.get(s.classes[0].id), { cantrips: 1, levelled: 1, prepared: 1 });
  assert.deepEqual(d.spellCounts.get(s.classes[1].id), { cantrips: 0, levelled: 1, prepared: 0 });
});
