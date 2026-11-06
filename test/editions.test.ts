// Imports per edition: 2014 data is what it was, 2024 data holds the 2024 rules, and they never mix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompendium, importOptions, importOutdated, IMPORT_VERSION, type BrewEntry } from "../src/data/build.ts";
import { removedFrom } from "../src/data/entries.ts";
import { mergedEntries } from "../src/data/report.ts";
import { read } from "./fixtures/fivetools.ts";

const noDate = <T extends { meta: object }>(d: T) => ({ ...d, meta: { ...d.meta, generated: undefined, ruleset: undefined } });

test("edition 2014 leaves out the same as the 2014 filter", async () => {
  assert.deepEqual(noDate(await buildCompendium({ read, edition: "2014" })), noDate(await buildCompendium({ read, rules2014Only: true })));
});

test("the 2014 filter alone doesn't stamp the data, as imports before editions didn't", async () => {
  assert.equal((await buildCompendium({ read, rules2014Only: true })).meta.ruleset, undefined);
  assert.equal((await buildCompendium({ read, edition: "2014" })).meta.ruleset, "5e-2014");
  assert.equal((await buildCompendium({ read, edition: "2024" })).meta.ruleset, "5e-2024");
});

test("2024 data has the 2024 entries, none reprinted for 2024, and classic content marked", async () => {
  const d = await buildCompendium({ read, edition: "2024" });
  assert.deepEqual(d.races.map((r) => r.id), ["dwarf|xphb"]);
  assert.deepEqual(d.backgrounds.map((b) => b.id), ["acolyte|xphb"]);
  assert.deepEqual(d.feats.map((f) => f.id), ["alert|xphb", "grappler|xphb"]);
  assert.deepEqual(d.items.map((i) => i.id), ["longsword|xphb"]);
  assert.deepEqual(d.classes.map((c) => c.id), ["fighter|xphb"]);
  // the 2024 Fireball, and Toll the Dead, which has no 2024 version
  assert.deepEqual(d.spells.map((s) => s.id).sort(), ["fireball|xphb", "toll-the-dead|xge"]);
  assert.ok(d.meta.classicEntries! >= 1);
});

test("a subclass made for a 2024 class stays, and its features are found, unless the class has a 2024 version of it", async () => {
  const fighter = (await buildCompendium({ read, edition: "2024" })).classes[0];
  assert.deepEqual(fighter.subclasses.map((s) => s.id).sort(), ["fighter|champion|xphb", "fighter|samurai|xge"]);
  const samurai = fighter.subclasses.find((s) => s.shortName === "Samurai")!;
  assert.deepEqual(samurai.features.map((f) => f.name), ["Samurai"]);
});

test("without classic content, 2024 data still keeps the subclasses of its classes", async () => {
  const d = await buildCompendium({ read, edition: "2024", classic: false });
  assert.deepEqual(d.spells.map((s) => s.id), ["fireball|xphb"]);
  assert.equal(d.classes[0].subclasses.length, 2);
});

test("the SRD of each edition", async () => {
  const d = await buildCompendium({ read, edition: "2024", srdOnly: true });
  assert.deepEqual(d.spells.map((s) => s.id), ["fireball|xphb"]);
  assert.deepEqual(d.classes[0].subclasses.map((s) => s.id), ["fighter|champion|xphb"]);
  assert.deepEqual(d.classes[0].features.map((f) => f.name), ["Second Wind", "Weapon Mastery", "Fighter Subclass"]);
  assert.equal(d.meta.srdOnly, true);
});

test("the abilities of older races don't count under the 2024 rules", async () => {
  const brew = { file: "b.json", json: { _meta: { sources: [{ json: "NEW", full: "New" }] }, race: [{ name: "Moss Folk", source: "NEW", edition: "one", size: ["S"], speed: 30, ability: [{ str: 2 }] }] } };
  const d = await buildCompendium({ read, edition: "2024", homebrew: [brew] });
  assert.deepEqual(d.races.find((r) => r.name === "Moss Folk")!.ability, []);
});

test("homebrew goes to the rules it says, and with nothing said to 2014", async () => {
  const brew = () => ({
    file: "b.json",
    json: {
      _meta: { sources: [{ json: "OLD", full: "Old Book" }, { json: "NEW", full: "New Book" }] },
      spell: [{ name: "Old Spell", source: "OLD", level: 1, school: "V", entries: ["x"] }, { name: "New Spell", source: "NEW", edition: "one", level: 1, school: "V", entries: ["x"] }],
      subclass: [{ name: "Way of Ink", shortName: "Ink", source: "OLD", className: "Fighter", classSource: "XPHB", subclassFeatures: [] }],
    },
  });
  const e24: BrewEntry[] = [], e14: BrewEntry[] = [];
  const d24 = await buildCompendium({ read, edition: "2024", homebrew: [brew()], brewEntry: (e) => e24.push(e) });
  const d14 = await buildCompendium({ read, edition: "2014", homebrew: [brew()], brewEntry: (e) => e14.push(e) });
  assert.ok(d24.spells.some((s) => s.name === "New Spell") && !d24.spells.some((s) => s.name === "Old Spell"));
  assert.ok(d14.spells.some((s) => s.name === "Old Spell") && !d14.spells.some((s) => s.name === "New Spell"));
  assert.ok(d24.classes[0].subclasses.some((s) => s.shortName === "Ink"), "made for the 2024 class");
  assert.equal(e24.find((e) => e.name === "Old Spell")!.reason, "2014 edition");
  assert.equal(e14.find((e) => e.name === "New Spell")!.reason, "2024 edition");
  // imported by either edition is imported
  const both = mergedEntries([e14, e24]);
  assert.equal(both.find((e) => e.name === "Old Spell")!.reason, null);
  assert.equal(both.find((e) => e.name === "New Spell")!.reason, null);
});

test("each edition has its own import version", () => {
  assert.equal(importOutdated({ importVersion: IMPORT_VERSION }), false);
  assert.equal(importOutdated({ importVersion: IMPORT_VERSION - 1 }), true);
  assert.equal(importOutdated({ importVersion: 1, ruleset: "5e-2024" }), false);
  assert.equal(importOutdated({ importVersion: 0, ruleset: "5e-2024" }), true);
});

test("removed entries are of the data they were removed from; older ones of the 2014 data", () => {
  const list = [{ kind: "spell" as const, name: "A", source: "XGE" }, { kind: "spell" as const, name: "B", source: "XGE", ruleset: "5e-2024" }];
  assert.deepEqual(removedFrom(list, "5e-2014").map((e) => e.name), ["A"]);
  assert.deepEqual(removedFrom(list, "5e-2024").map((e) => e.name), ["B"]);
});

test("the options of an import: 2014 as the settings have always said", () => {
  const st = (importRules2014: boolean, importOnlyWithNotes: boolean, importClassicIn2024 = true) => ({ importRules2014, importOnlyWithNotes, importClassicIn2024 });
  assert.deepEqual(importOptions("5e-2014", st(true, false)), { rules2014Only: true });
  assert.deepEqual(importOptions("5e-2014", st(false, false)), { rules2014Only: false });
  assert.deepEqual(importOptions("5e-2014", st(true, true)), { rules2014Only: false });
  assert.deepEqual(importOptions("5e-2014", st(false, true)), { rules2014Only: false });
  assert.deepEqual(importOptions("5e-2024", st(true, false, false)), { edition: "2024", classic: false });
});
