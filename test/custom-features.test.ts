import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";

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
