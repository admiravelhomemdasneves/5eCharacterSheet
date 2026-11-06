// Rules per character: older notes stay 2014, unknown rules are kept and never read as other rules,
// and a sheet whose rules can't be worked out keeps what it holds.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as E from "../src/rules/engine.ts";
import { sheetConflicts } from "../src/rules/conflicts.ts";
import { emptyContext } from "../src/rules/context.ts";
import { RULESET_2014 } from "../src/rules/5e-2014/custom.ts";
import { ROOT, srdData } from "./helpers.ts";

const data = srdData() as E.Compendium;
const r = new E.Rules(data);
const fighter = data.classes.find((c) => c.name === "Fighter")!;

test("a new character and an older note are for the 2014 rules", () => {
  assert.equal(E.newCharacter("A").ruleset, "5e-2014");
  assert.equal(E.normalize({}).ruleset, "5e-2014");
  assert.equal(E.normalize(null).ruleset, "5e-2014");
  assert.equal(E.normalize({ name: "Old" }).ruleset, "5e-2014");
  assert.equal(E.normalize({ ruleset: "" }).ruleset, "5e-2014");
});

test("rules this version doesn't know are kept through saving and reading back", () => {
  const s = E.normalize({ ruleset: "5e-2030" });
  assert.equal(s.ruleset, "5e-2030");
  assert.equal(E.normalize(E.savedState(s) as Partial<E.CharState>).ruleset, "5e-2030");
});

test("what a state holds that the data doesn't have", () => {
  const s = E.newCharacter("A");
  assert.deepEqual(E.unresolvedIds(r, s), []);
  s.classes = [{ id: fighter.id, subclass: fighter.subclasses[0].id, level: 3, hpRolls: [], skills: [] }];
  s.race = data.races[0].id;
  s.background = data.backgrounds[0].id;
  assert.deepEqual(E.unresolvedIds(r, s), []);
  s.race = "dwarf|xphb"; s.background = "acolyte|xphb";
  s.classes.push({ id: "fighter|xphb", subclass: null, level: 1, hpRolls: [], skills: [] });
  s.classes[0].subclass = "fighter|champion|xphb";
  assert.deepEqual(E.unresolvedIds(r, s), ["dwarf|xphb", "acolyte|xphb", "fighter|champion|xphb", "fighter|xphb"]);
});

test("current HP is limited only by a maximum that can be trusted", () => {
  const s = E.newCharacter("A");
  s.hp.current = 42;
  assert.equal(E.settledHp(s, true, 10), 10);
  assert.equal(E.settledHp(s, false, 1), 42);
});

test("the flat keys of a sheet that can't be worked out stay as they were", () => {
  const s = E.newCharacter("A");
  s.classes = [{ id: "fighter|xphb", subclass: null, level: 5, hpRolls: [], skills: [] }];
  assert.deepEqual(Object.keys(E.flatKeys(r, s, false, false, "Note")), ["name", "player"]);
  // nothing that takes the place of the old values
  const fm: Record<string, unknown> = { hp: 44, class: "Fighter 5", stats: [15, 14, 13, 12, 10, 8] };
  Object.assign(fm, E.flatKeys(r, s, false, false, "Note"));
  assert.equal(fm.hp, 44);
  assert.equal(fm.class, "Fighter 5");
});

test("the flat keys of a sheet are what they always were", () => {
  const s = E.newCharacter("A");
  s.abilities.method = "manual";
  s.abilities.base = { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 };
  s.classes = [{ id: fighter.id, subclass: null, level: 2, hpRolls: [], skills: [] }];
  assert.deepEqual(E.flatKeys(r, s, false, true, "Note"), { name: "A", player: undefined, race: undefined, class: "Fighter 2", level: 2, hp: 20, ac: 11, modifier: 1, stats: [16, 12, 14, 8, 10, 10] });
  s.manual.classes = [{ name: "Knight", level: 3 } as E.CharState["manual"]["classes"][number]];
  s.manual.maxHp = 30; s.manual.ac = 17;
  const m = E.flatKeys(r, s, true, true, "Note");
  assert.equal(m.class, "Knight 3");
  assert.equal(m.hp, 30);
  assert.equal(m.ac, 17);
});

test("conflicts of a sheet", () => {
  const base = { ruleset: "5e-2014", label: "D&D 5e (2014)", status: "ready" as const, unresolved: [] };
  assert.deepEqual(sheetConflicts(base), []);
  assert.deepEqual(sheetConflicts({ ...base, status: "loading" }), []);
  assert.deepEqual(sheetConflicts({ ...base, status: "loading", unresolved: ["x"] }), []);
  assert.deepEqual(sheetConflicts({ ...base, status: "unavailable" }).map((c) => c.kind), ["no-data"]);
  assert.deepEqual(sheetConflicts({ ...base, unresolved: ["fighter|xphb"] }).map((c) => c.kind), ["unresolved-entries"]);
  const unknown = sheetConflicts({ ...base, ruleset: "5e-2030", label: null, status: "unavailable" });
  assert.deepEqual(unknown.map((c) => c.kind), ["unknown-rules"]);
  assert.match(unknown[0].message, /5e-2030/);
});

test("an empty context says it has nothing, and starts in manual mode like the plugin did", () => {
  const c = emptyContext("5e-2014", RULESET_2014, "loading");
  assert.equal(c.manual, true);
  assert.equal(c.rules.data.classes.length, 0);
  assert.equal(emptyContext("5e-2030", null, "unavailable").ruleset, null);
});

test("sheets and pages use the context of their rules, not plugin-wide data", () => {
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const f of [...files(path.join(ROOT, "src", "ui")), path.join(ROOT, "src", "settings.ts")]) {
    const found = fs.readFileSync(f, "utf8").match(/plugin\.(rules|manual|linker|baseData|customOnly|ruleset|customProblems|customOther|importIsOutdated)\b/);
    assert.equal(found, null, `${path.basename(f)}: ${found?.[0]}`);
  }
});
