import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";

test("long rest: HP, slots, resources and death saves back, half the hit dice, one exhaustion level less", () => {
  const s = E.newCharacter();
  s.hp = { current: 3, temp: 5, adjust: 0, override: null };
  s.slots.used = [2, 1, 0, 0, 0, 0, 0, 0, 0]; s.slots.pactUsed = 1;
  s.hitDiceUsed = 5; s.resources = { "Monk:Ki Points": 3 };
  s.deathSaves = { success: 1, fail: 2 }; s.exhaustion = 2;
  E.longRest(s, 40, 7);
  assert.deepEqual(s.hp, { current: 40, temp: 0, adjust: 0, override: null });
  assert.deepEqual(s.slots.used, Array(9).fill(0));
  assert.equal(s.slots.pactUsed, 0);
  assert.equal(s.hitDiceUsed, 2); // 7 hit dice: 3 back
  assert.deepEqual(s.resources, {});
  assert.deepEqual(s.deathSaves, { success: 0, fail: 0 });
  assert.equal(s.exhaustion, 1);
});

test("long rest gives back at least one hit die, and never below none used", () => {
  const s = E.newCharacter();
  s.hitDiceUsed = 1;
  E.longRest(s, 10, 1);
  assert.equal(s.hitDiceUsed, 0);
  E.longRest(s, 10, 1);
  assert.equal(s.hitDiceUsed, 0);
  assert.equal(s.exhaustion, 0);
});

test("rolled scores: the three highest of four d6", () => {
  // the dice come out 6, 1, 4, 3 for every ability: 6 + 4 + 3
  const faces = [6, 1, 4, 3];
  let i = 0;
  const rand = () => (faces[i++ % 4] - 1) / 6;
  assert.deepEqual(E.rollAbilityScores(rand), { str: 13, dex: 13, con: 13, int: 13, wis: 13, cha: 13 });
  const real = E.rollAbilityScores();
  for (const a of E.ABILITIES) assert.ok(real[a] >= 3 && real[a] <= 18);
});

test("setting a score is the same as pressing + or − that many times", () => {
  const a = E.newCharacter(), b = E.newCharacter(); // point buy, all 8
  E.setAbilityScore(a, "str", 8, 16);
  for (let n = 0; n < 8; n++) E.stepAbility(b, "str", 1);
  assert.deepEqual(a.abilities, b.abilities);
  assert.equal(a.abilities.base.str, 15); // point buy stops at 15, the rest goes to Adjust
  assert.equal(a.abilities.adjust.str, 1);
  E.setAbilityScore(a, "str", 16, 7);
  assert.deepEqual([a.abilities.base.str, a.abilities.adjust.str], [8, -1]);
});

test("manual hit dice text and attunement count", () => {
  assert.deepEqual(E.parseHitDice("3d8 + 2d10"), { d8: 3, d10: 2 });
  assert.deepEqual(E.parseHitDice("d12, 2 d 8, 1d8"), { d12: 1, d8: 3 });
  assert.deepEqual(E.parseHitDice(""), {});
  const s = E.newCharacter();
  s.inventory = [true, false, true].map((attuned) => ({ id: null, name: "x", qty: 1, weight: null, equipped: false, attuned, notes: "" }));
  assert.equal(E.attunedCount(s), 2);
});
