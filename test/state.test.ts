import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";

// What the note holds after a save: the state as JSON (undefined fields gone), read back and normalized
const saved = (s: E.CharState) => E.normalize(JSON.parse(JSON.stringify(s)));

test("a state read back from its own save is the same state (not an outside change)", () => {
  const s = E.normalize({ name: "Ann", feats: [{ id: "alert", picks: [], free: undefined }], customFeatures: [{ id: "", kind: "class", name: "X", level: 2, text: "" }] });
  s.skills.stealth = 2;
  s.ui.hidden.spells = true;
  assert.ok(E.sameState(saved(s), s));
});

test("key order does not matter, values do", () => {
  const a = E.normalize({ name: "Ann", skills: { arcana: 1, stealth: 2 } });
  const b = E.normalize({ name: "Ann", skills: { stealth: 2, arcana: 1 } });
  assert.ok(E.sameState(a, b));
  b.hp.temp = 5;
  assert.ok(!E.sameState(a, b));
});

test("states are stamped with the current version, and only older ones are migrated", () => {
  assert.equal(E.newCharacter().version, E.STATE_VERSION);
  assert.equal(E.normalize({ name: "Old" }).version, E.STATE_VERSION);
  assert.equal(E.stateVersion({}), 1);
  // ASI points on the scores: moved to an ASI entry in a version 1 state, left alone in a newer one
  const asi = { str: 2, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  const abilities = (version: number): Partial<E.CharState> => ({ version, abilities: { method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, asi: { ...asi }, adjust: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } } });
  assert.deepEqual(E.normalize(abilities(1)).feats, [{ id: E.ASI_ID, picks: ["str", "str"] }]);
  assert.deepEqual(E.normalize(abilities(2)).feats, []);
});

test("older states with ASI points on the scores read back the same after their first save", () => {
  const s = E.normalize({ name: "Old", abilities: { method: "manual", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, asi: { str: 2, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, adjust: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } } });
  assert.ok(E.sameState(saved(s), s));
});
