import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";

// 1.1.0's reading of the manual hit dice, as it was (src/ui/sheet.ts there): text only
function parseHitDice110(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of (text || "").matchAll(/(\d*)\s*d\s*(\d+)/gi)) out[`d${m[2]}`] = (out[`d${m[2]}`] || 0) + (parseInt(m[1]) || 1);
  return out;
}
const manual = (hitDice: E.ManualHitDice[]) => { const s = E.newCharacter("M"); s.manual.hitDice = hitDice; return s; };

test("1.1.0 reads the manual hit dice a newer version saves", () => {
  const saved: any = E.savedState(manual([{ count: 5, sides: 10 }, { count: 2, sides: 8 }]));
  assert.equal(saved.manual.hitDice, "5d10 + 2d8");
  assert.deepEqual(parseHitDice110(saved.manual.hitDice), { d10: 5, d8: 2 });
  // none set: the empty text 1.1.0 also wrote
  assert.equal((E.savedState(manual([])) as any).manual.hitDice, "");
  assert.deepEqual(parseHitDice110((E.savedState(manual([])) as any).manual.hitDice), {});
});

test("a state read back from its own save is the same, also with two entries of one die", () => {
  const s = E.normalize(manual([{ count: 3, sides: 8 }, { count: 2, sides: 8 }, { count: 1, sides: 12 }]));
  const back = E.normalize(JSON.parse(JSON.stringify(E.savedState(s))));
  assert.deepEqual(back.manual.hitDice, s.manual.hitDice);
  assert.ok(E.sameState(back, s));
  // what 1.1.0 typed and saved reads as before
  assert.deepEqual(E.normalize({ name: "Old", manual: { hitDice: "d10" } as any }).manual.hitDice, [{ count: 1, sides: 10 }]);
});

test("the view an older version writes back into a newer note is dropped", () => {
  const s = E.normalize({ name: "Synced", version: 2, ui: { collapsed: { skills: true }, editing: { abilities: true }, sourceFilter: [], hidden: { spells: true } } } as any);
  assert.deepEqual(s.ui, { hidden: { spells: true } });
  // a version 1 note's view is still carried over once (by the sheet, from what the note holds)
  assert.deepEqual(E.legacyView({ name: "Old", ui: { collapsed: { skills: true }, editing: {}, hidden: {} } } as any), { collapsed: { skills: true }, editing: {} });
});
