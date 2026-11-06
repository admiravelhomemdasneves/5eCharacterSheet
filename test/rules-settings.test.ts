// Choosing rules: changing a sheet's rules, settings from older versions, conflicts, and the bundled SRD 5.2.1.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildCompendium, importOptions, type BrewEntry } from "../src/data/build.ts";
import { editionsApart, importedRulesets, isMixedData } from "../src/data/editions.ts";
import { Linker } from "../src/data/links.ts";
import { importReport } from "../src/data/report.ts";
import { dataConflicts } from "../src/rules/conflicts.ts";
import * as E from "../src/rules/engine.ts";
import { RULESETS } from "../src/rules/rulesets.ts";
import { read } from "./fixtures/fivetools.ts";
import { ROOT } from "./helpers.ts";

const srd52 = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "srd-5.2.1.json"), "utf8")) as E.Compendium;

test("changing a sheet's rules keeps what it was, and changing back brings it back", () => {
  const s = E.newCharacter("A");
  s.race = "dwarf|phb"; s.background = "acolyte|phb";
  s.classes = [{ id: "fighter|phb", subclass: null, level: 5, hpRolls: [], skills: [] }];
  s.hp.current = 37; s.hitDiceUsed = 2;
  s.abilities.base.str = 15; s.biography = "Text";
  const before = structuredClone(s);
  E.changeRules(s, "5e-2024");
  assert.equal(s.ruleset, "5e-2024");
  assert.equal(s.race, null);
  assert.deepEqual(s.classes, []);
  assert.equal(s.hp.current, null);
  assert.equal(s.abilities.base.str, 15, "scores stay");
  assert.equal(s.biography, "Text", "notes stay");
  // through a save, as it is kept in the note
  const saved = E.normalize(E.savedState(s));
  s.race = "elf|xphb";
  saved.race = "elf|xphb";
  E.changeRules(saved, "5e-2014");
  assert.equal(saved.ruleset, "5e-2014");
  assert.equal(saved.race, "dwarf|phb");
  assert.deepEqual(saved.classes, before.classes);
  assert.equal(saved.hp.current, 37);
  assert.equal(saved.hitDiceUsed, 2);
  E.changeRules(saved, "5e-2024");
  assert.equal(saved.race, "elf|xphb", "and what it was under the others too");
});

test("a sheet with entries of the new rules keeps them", () => {
  const s = E.newCharacter("A");
  s.race = "elf|xphb";
  E.changeRules(s, "5e-2024", true);
  assert.equal(s.ruleset, "5e-2024");
  assert.equal(s.race, "elf|xphb");
});

test("changing to the same rules changes nothing", () => {
  const s = E.newCharacter("A"), before = structuredClone(s);
  E.changeRules(s, "5e-2014");
  assert.deepEqual(s, before);
});

test("only an older filter that let editions mix keeps them mixed", () => {
  assert.equal(editionsApart(null), true, "a new install");
  assert.equal(editionsApart({}), true);
  assert.equal(editionsApart({ importRules2014: true, importOnlyWithNotes: false }), true);
  assert.equal(editionsApart({ importRules2014: false, importOnlyWithNotes: false }), false);
  assert.equal(editionsApart({ importRules2014: true, importOnlyWithNotes: true }), false);
  assert.equal(editionsApart({ importRules2014: false, importOnlyWithNotes: true }), false);
  assert.equal(editionsApart({ splitEditions: true, importRules2014: false }), true, "once separated, they stay so");
});

test("each edition imports what it should", () => {
  const st = { importRules2014: true, importOnlyWithNotes: true, importClassicIn2024: true };
  assert.deepEqual(importOptions("5e-2014", { ...st, splitEditions: true }), { edition: "2014" });
  assert.deepEqual(importOptions("5e-2014", { ...st, splitEditions: false }), { rules2014Only: false });
  assert.deepEqual(importOptions("5e-2024", { ...st, splitEditions: true }), { edition: "2024", classic: true });
});

test("an import touches only the rules whose source is imported data", () => {
  assert.deepEqual(importedRulesets({ dataSource: "imported", dataSource2024: "none" }), ["5e-2014"]);
  assert.deepEqual(importedRulesets({ dataSource: "srd", dataSource2024: "imported" }), ["5e-2024"]);
  assert.deepEqual(importedRulesets({ dataSource: "imported", dataSource2024: "imported" }), ["5e-2014", "5e-2024"]);
  assert.deepEqual(importedRulesets({ dataSource: "srd", dataSource2024: "none" }), []);
});

test("data with both editions is told apart from data of one", async () => {
  assert.equal(isMixedData(await buildCompendium({ read })), true);
  assert.equal(isMixedData(await buildCompendium({ read, rules2014Only: true })), false);
  assert.equal(isMixedData(await buildCompendium({ read, edition: "2014" })), false);
  assert.equal(isMixedData(await buildCompendium({ read, edition: "2024" })), false);
});

test("conflicts between the rules chosen and their data", () => {
  const rules = (a: string, b: string, sa: "ready" | "unavailable" = "ready") => [{ id: "5e-2014", label: "2014", source: a, status: sa }, { id: "5e-2024", label: "2024", source: b, status: "ready" as const }];
  const kinds = (i: Parameters<typeof dataConflicts>[0]) => dataConflicts(i).map((c) => c.kind);
  assert.deepEqual(kinds({ rules: rules("srd", "none"), defaultRuleset: "5e-2014", mixed: false }), []);
  assert.deepEqual(kinds({ rules: rules("none", "none"), defaultRuleset: "5e-2014", mixed: false }), [], "manual mode is a choice");
  assert.deepEqual(kinds({ rules: rules("srd", "none"), defaultRuleset: "5e-2024", mixed: false }), ["default-without-data"]);
  assert.deepEqual(kinds({ rules: rules("imported", "none"), defaultRuleset: "5e-2014", mixed: true }), ["mixed-data"]);
  assert.deepEqual(kinds({ rules: rules("imported", "none", "unavailable"), defaultRuleset: "5e-2014", mixed: false }), ["no-data"]);
});

test("the import report says what was left out for being for other rules", async () => {
  const brew = { file: "b.json", json: { _meta: { sources: [{ json: "NEW", full: "New" }] }, spell: [{ name: "New Spell", source: "NEW", edition: "one", level: 1, school: "V", entries: ["x"] }] } };
  const entries: BrewEntry[] = [];
  const data = await buildCompendium({ read, edition: "2014", homebrew: [brew], brewEntry: (e) => entries.push(e) });
  const r = importReport({ data, dataFolder: "x", files: [brew], entries, messages: [] });
  assert.deepEqual(r.otherRules.map((e) => e.name), ["New Spell"]);
});

test("a note of the same name from another source isn't used for 2024 data", () => {
  const l = new Linker("c", [{ path: "c/compendium/spells/fireball.md", alias: "Fireball", source: "PHB" }]);
  assert.ok(l.note("spells", "Fireball", "XPHB"));
  l.sameSourceOnly = true;
  assert.equal(l.note("spells", "Fireball", "XPHB"), null);
});

test("both rulesets are there, and 2024 has custom entries too", () => {
  assert.deepEqual(RULESETS.map((r) => r.id), ["5e-2014", "5e-2024"]);
  assert.equal(RULESETS[1].profile, E.PROFILE_2024);
  assert.ok(RULESETS[1].kinds.length > 0);
});

test("bundled SRD 5.2.1: core content, attribution, nothing from outside it", () => {
  assert.equal(srd52.meta.ruleset, "5e-2024");
  assert.deepEqual(srd52.classes.map((c) => c.name), ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]);
  assert.ok(srd52.classes.every((c) => c.subclasses.length === 1));
  assert.equal(srd52.races.length, 9);
  assert.equal(srd52.races.reduce((a, r) => a + r.subraces.length, 0), 24);
  assert.equal(srd52.backgrounds.length, 4);
  assert.equal(srd52.feats.length, 17);
  assert.equal(srd52.spells.length, 339);
  assert.match(srd52.meta.attribution!, /System Reference Document 5\.2\.1.*Creative Commons Attribution 4\.0/s);
  const text = JSON.stringify({ classes: srd52.classes.map((c) => c.subclasses.map((s) => s.name)), backgrounds: srd52.backgrounds.map((b) => b.name), feats: srd52.feats.map((f) => f.name) });
  for (const word of ["Battle Master", "Eldritch Knight", "Noble", "Tough"]) assert.ok(!text.includes(word), `found non-SRD "${word}"`);
  assert.ok(!JSON.stringify(srd52).includes("[["), "data must not contain wikilinks");
});

test("both SRD files are bundled as text, so they are parsed only when used", () => {
  const config = fs.readFileSync(path.join(ROOT, "esbuild.config.mjs"), "utf8");
  const filter = new RegExp(/filter: \/(.+)\/ \}/.exec(config)![1]);
  assert.ok(filter.test("/x/data/srd-5.1.json") && filter.test("/x/data/srd-5.2.1.json"));
});
