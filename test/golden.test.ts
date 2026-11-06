// The 2014 rules, pinned. Whatever is added for other rules, these results must not move: a difference
// here is a change for every 2014 sheet. `UPDATE_GOLDEN=1 npm test` writes them again, for a change
// to the 2014 results that is meant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildCompendium } from "../src/data/build.ts";
import * as E from "../src/rules/engine.ts";
import { read } from "./fixtures/fivetools.ts";
import { ROOT, srdData } from "./helpers.ts";

function golden(name: string, value: unknown) {
  const file = path.join(ROOT, "test", "golden", name);
  const json = JSON.parse(JSON.stringify(value)) as unknown;
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(file, JSON.stringify(json, null, 1) + "\n");
  assert.deepEqual(json, JSON.parse(fs.readFileSync(file, "utf8")), `${name} changed`);
}
/** without what only describes (texts and links) */
const numbers = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (k, v: unknown) => (k === "text" || k === "link" ? undefined : v)));

const data = srdData() as E.Compendium;
const r = new E.Rules(data);
const named = <T extends { name: string }>(list: T[], name: string) => list.find((x) => x.name === name)!;

/** a character of one class and level, with what the sheet needs filled in */
function character(c: E.ClassData, level: number, race: E.RaceData) {
  const s = E.newCharacter(`${c.name} ${level}`);
  s.race = race.id;
  s.subrace = race.subraces[0]?.id ?? null;
  s.background = named(data.backgrounds, "Acolyte").id;
  s.abilities.method = "manual";
  s.abilities.base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  s.classes = [{ id: c.id, subclass: level >= c.subclassLevel ? c.subclasses[0].id : null, level, hpRolls: [], skills: [] }];
  s.inventory = ["Chain Mail", "Shield", "Longsword", "Longbow"].map((n) => ({ id: named(data.items, n).id, name: n, qty: 1, weight: null, equipped: true, attuned: false, notes: "" }));
  return s;
}
function summary(s: E.CharState) {
  const d = E.derive(r, s);
  return numbers({
    level: d.level, pb: d.pb, scores: d.scores, saves: d.saves, skills: d.skills, hp: d.hp, ac: d.ac, initiative: d.initiative, speeds: d.speeds,
    hitDice: d.hitDice, darkvision: d.darkvision, features: d.features.flatMap((g) => g.features.map((f) => `${g.cls.name} ${f.level} ${f.name}`)), asi: d.asi, resources: d.resources,
    casters: d.casters, spellCounts: Object.fromEntries(d.spellCounts), slots: d.slots, attacks: d.attacks, pending: d.pending,
  });
}

test("the bundled SRD 5.1 data is the same file", () => {
  const hash = createHash("sha256").update(fs.readFileSync(path.join(ROOT, "data", "srd-5.1.json"))).digest("hex");
  assert.equal(hash, "b4b68be500f711fd24a7541e47ec3e5f27a5499af014be4a92bf7b5a8890ca17");
});

test("every SRD class gives the same results at each level", () => {
  const out: Record<string, unknown> = {};
  data.classes.forEach((c, i) => {
    for (const level of [1, 2, 3, 5, 11, 20]) out[`${c.name} ${level}`] = summary(character(c, level, data.races[i % data.races.length]));
  });
  golden("srd-2014-characters.json", out);
});

test("a multiclass caster gives the same results", () => {
  const s = character(named(data.classes, "Paladin"), 5, named(data.races, "Human"));
  const add = (name: string, level: number) => s.classes.push({ id: named(data.classes, name).id, subclass: named(data.classes, name).subclasses[0].id, level, hpRolls: [], skills: [] });
  add("Warlock", 3); add("Wizard", 3); add("Ranger", 4);
  golden("srd-2014-multiclass.json", summary(s));
});

test("a long rest gives the same results", () => {
  const s = character(named(data.classes, "Wizard"), 7, named(data.races, "Elf"));
  s.hp = { ...s.hp, current: 1, temp: 3 };
  s.hitDiceUsed = 6; s.exhaustion = 3;
  s.slots.used = [2, 1, 0, 0, 0, 0, 0, 0, 0];
  s.deathSaves = { success: 1, fail: 2 };
  E.longRest(s, 40, 7);
  golden("srd-2014-long-rest.json", { hp: s.hp, slots: s.slots, hitDiceUsed: s.hitDiceUsed, exhaustion: s.exhaustion, deathSaves: s.deathSaves });
});

test("the importer gives the same 2014 data", async () => {
  const d = await buildCompendium({ read, rules2014Only: true });
  golden("import-2014.json", { ...d, meta: { ...d.meta, generated: undefined } });
  const srd = await buildCompendium({ read, rules2014Only: true, srdOnly: true });
  golden("import-srd-5.1.json", { ...srd, meta: { ...srd.meta, generated: undefined } });
});
