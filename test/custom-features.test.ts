import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { srdData } from "./helpers.ts";

const srd = srdData();
const r = new E.Rules(srd);

test("feature index: class and subclass features, race traits and background features from the data", () => {
  const cls = E.featureIndex(r, "class"), race = E.featureIndex(r, "race");
  const fighter = srd.classes.find((c: any) => c.name === "Fighter");
  const surge = cls.find((f) => f.name === "Action Surge" && f.from === "Fighter");
  assert.ok(surge);
  assert.equal(surge.key, E.featureKey(fighter.id, "Action Surge", 2));
  assert.ok(cls.some((f) => f.from === "Fighter (Champion)" && f.name === "Improved Critical"));
  assert.ok(!cls.some((f) => f.name === "Champion"), "no subclass-name placeholders");
  assert.ok(race.some((f) => f.name === "Darkvision"));
  assert.ok(race.some((f) => f.from === "Background: Acolyte" && f.name === "Shelter of the Faithful"));
  assert.ok(!race.some((f) => E.RACE_TRAIT_SKIP.has(f.name)), "no traits the sheet shows elsewhere");
  assert.equal(E.featureIndex(r, "class"), cls, "built once per data set");
});

test("added data features keep a copy and point at the data", () => {
  const f = E.featureIndex(r, "class").find((x) => x.name === "Action Surge")!;
  const a = E.addedFeature("class", f);
  assert.equal(a.ref, f.key);
  assert.deepEqual([a.kind, a.name, a.level, a.text], ["class", f.name, 2, f.text]);
  const loaded = E.normalize(JSON.parse(JSON.stringify({ customFeatures: [a], removedFeatures: [f.key] })));
  assert.equal(loaded.customFeatures[0].ref, f.key);
  assert.deepEqual(loaded.removedFeatures, [f.key]);
  assert.equal("ref" in E.normalize({ customFeatures: [E.newCustomFeature("race")] }).customFeatures[0], false);
});

test("custom features: new ones get unique ids and a level within 1-20", () => {
  const a = E.newCustomFeature("class", 25), b = E.newCustomFeature("race");
  assert.notEqual(a.id, b.id);
  assert.equal(a.level, 20);
  assert.deepEqual({ ...b, id: "" }, { id: "", kind: "race", name: "", level: 1, text: "" });
});

test("custom features: listed by kind, class features by level", () => {
  const s = E.newCharacter();
  s.customFeatures = [
    { id: "a", kind: "class", name: "Boon", level: 7, text: "" },
    { id: "b", kind: "race", name: "Gills", level: 1, text: "" },
    { id: "c", kind: "class", name: "Tweak", level: 2, text: "" },
  ];
  assert.deepEqual(E.customFeatures(s, "class").map((f) => f.id), ["c", "a"]);
  assert.deepEqual(E.customFeatures(s, "race").map((f) => f.id), ["b"]);
  assert.deepEqual(s.customFeatures.map((f) => f.id), ["a", "b", "c"], "the saved order is left alone");
});

test("custom and hidden features: saved characters without them load unchanged, bad values are fixed", () => {
  const saved: Partial<E.CharState> = { ...E.newCharacter("Old") };
  delete (saved as Record<string, unknown>).customFeatures;
  delete (saved as Record<string, unknown>).hiddenFeatures;
  const s = E.normalize(saved);
  assert.deepEqual(s.customFeatures, []);
  assert.deepEqual(s.hiddenFeatures, []);
  const odd = E.normalize({ customFeatures: [{ id: "x", kind: "nope", name: 3, level: 99 }, null], hiddenFeatures: "x" } as unknown as Partial<E.CharState>);
  assert.deepEqual(odd.customFeatures, [{ id: "x", kind: "class", name: "3", level: 20, text: "" }]);
  assert.deepEqual(odd.hiddenFeatures, []);
});
