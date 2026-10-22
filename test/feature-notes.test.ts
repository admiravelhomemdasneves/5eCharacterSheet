import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { srdData } from "./helpers.ts";

const srd = srdData();
const r = new E.Rules(srd);
const fighter = srd.classes.find((c: any) => c.name === "Fighter");

test("feature keys: owner, name and level; repeated features stay apart", () => {
  assert.equal(E.featureKey("fighter|phb", "Second Wind", 1), "fighter|phb#second wind#1");
  assert.equal(E.featureKey("acolyte|phb", " Shelter of the Faithful "), "acolyte|phb#shelter of the faithful");
  const s = E.newCharacter();
  s.classes = [{ id: fighter.id, subclass: null, level: 8, hpRolls: [], skills: [] }];
  const [g] = E.classFeatures(r, s);
  const asi = g.features.filter((f) => f.name === "Ability Score Improvement").map((f) => E.featureKey(g.cls.id, f.name, f.level));
  assert.equal(asi.length, 3); // levels 4, 6 and 8
  assert.equal(new Set(asi).size, asi.length);
});

test("feature notes survive a level change", () => {
  const s = E.newCharacter();
  s.classes = [{ id: fighter.id, subclass: null, level: 3, hpRolls: [], skills: [] }];
  const key = E.featureKey(fighter.id, "Second Wind", 1);
  s.featureNotes[key] = "Used once this session";
  s.classes[0].level = 5;
  const loaded = E.normalize(JSON.parse(JSON.stringify(s)));
  const [g] = E.classFeatures(r, loaded);
  const f = g.features.find((x) => x.name === "Second Wind")!;
  assert.equal(loaded.featureNotes[E.featureKey(g.cls.id, f.name, f.level)], "Used once this session");
});

test("saved characters without feature notes load unchanged", () => {
  const saved: Partial<E.CharState> = { ...E.newCharacter("Old") };
  delete (saved as Record<string, unknown>).featureNotes;
  const s = E.normalize(saved);
  assert.deepEqual(s.featureNotes, {});
  assert.equal(s.name, "Old");
  // malformed values become an empty map or strings
  assert.deepEqual(E.normalize({ featureNotes: [] as unknown as Record<string, string> }).featureNotes, {});
  assert.deepEqual(E.normalize({ featureNotes: { a: 3 } as unknown as Record<string, string> }).featureNotes, { a: "3" });
});
