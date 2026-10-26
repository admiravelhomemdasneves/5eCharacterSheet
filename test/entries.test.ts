import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompendium, type BrewEntry, type HomebrewFile } from "../src/data/build.ts";
import { entryKey, groupByFile, listEntries, noteKey, removedKeys, withoutEntries } from "../src/data/entries.ts";
import { Linker } from "../src/data/links.ts";

// homebrew only (no 5etools data): a race with a subrace, a class with a subclass, a spell and an item
const BREW: HomebrewFile = {
  file: "homebrew/Book.json",
  json: {
    _meta: { sources: [{ json: "BK", full: "The Book" }] },
    race: [{ name: "Moss Folk", source: "BK", size: ["S"], speed: 25 }],
    subrace: [{ name: "Deep", source: "BK", raceName: "Moss Folk", raceSource: "BK" }],
    class: [{ name: "Warden", source: "BK", hd: { faces: 10 } }],
    subclass: [{ name: "Oath of Ash", shortName: "Ash", source: "BK", className: "Warden", classSource: "BK" }],
    spell: [{ name: "Ink Blot", source: "BK", level: 1, school: "V", entries: ["See {@spell Ink Blot|BK}."] }],
    item: [{ name: "Ash Ring", source: "BK", rarity: "rare" }],
  },
};
const brewEntries: BrewEntry[] = [];
const data = await buildCompendium({ homebrew: [BREW], brewEntry: (e) => brewEntries.push(e) });

test("entries of the data: subraces and subclasses named as in the import report", () => {
  assert.deepEqual(listEntries(data).map((e) => [e.kind, e.name]), [
    ["race", "Moss Folk"], ["subrace", "Moss Folk (Deep)"], ["class", "Warden"], ["subclass", "Oath of Ash (Warden)"], ["spell", "Ink Blot"], ["item", "Ash Ring"],
  ]);
  // the keys match the homebrew entries the import told about, so their files can be found
  assert.deepEqual(listEntries(data).map((e) => e.key).sort(), brewEntries.map((e) => entryKey(e.kind, e.name, e.source)).sort());
  // a subclass's note is found by its own name, a subrace's by "Race (Subrace)"
  const notes = Object.fromEntries(listEntries(data).map((e) => [e.name, e.noteKey]));
  assert.equal(notes["Oath of Ash (Warden)"], "classes|oath of ash|bk");
  assert.equal(notes["Moss Folk (Deep)"], "races|moss folk (deep)|bk");
});

test("removing entries: a race takes its subraces along; a subclass leaves its class", () => {
  const removed = removedKeys([{ kind: "race", name: "Moss Folk", source: "BK" }, { kind: "subclass", name: "Oath of Ash (Warden)", source: "bk" }, { kind: "spell", name: "ink blot", source: "BK" }]);
  const d = withoutEntries(data, removed);
  assert.deepEqual(listEntries(d).map((e) => e.name), ["Warden", "Ash Ring"]);
  // the data given is not changed
  assert.equal(listEntries(data).length, 6);
  assert.equal(withoutEntries(data, new Set()), data);
});

test("entries grouped by the file they came from; the rest is 5etools data", () => {
  const origins = { [entryKey("spell", "Ink Blot", "BK")]: "homebrew/Book.json", [entryKey("item", "Ash Ring", "BK")]: "homebrew/Other.json" };
  const { groups, total } = groupByFile(data, origins);
  assert.deepEqual(groups.map((g) => [g.file, g.entries.map((e) => e.name)]), [
    [null, ["Moss Folk", "Moss Folk (Deep)", "Warden", "Oath of Ash (Warden)"]],
    ["homebrew/Book.json", ["Ink Blot"]],
    ["homebrew/Other.json", ["Ash Ring"]],
  ]);
  assert.deepEqual([groups[0].counts.race, groups[0].counts.subclass, groups[1].counts.spell], [1, 1, 1]);
  assert.equal(total.item, 1);
});

test("a chosen compendium note wins over the one matched by name; \"\" means none", () => {
  const notes = [{ path: "C/compendium/spells/ink-blot", alias: "Ink Blot", source: "bk" }, { path: "C/compendium/items/ash-ring", alias: "Ash Ring", source: "bk" }];
  const linker = new Linker("C", notes, {
    [noteKey("spells", "Ink Blot", "BK")]: "Notes/My Ink Blot",
    [noteKey("items", "Ash Ring", "BK")]: "",
    [noteKey("classes", "Oath of Ash", "BK")]: "Notes/Ash",
  });
  const d = linker.attach(structuredClone(data));
  assert.equal(d.spells[0].link, "Notes/My Ink Blot");
  assert.equal(d.items[0].link, null);
  assert.equal(d.classes[0].subclasses[0].link, "Notes/Ash");
  // links inside text follow the chosen note too, and "Only entries with a note" counts it
  assert.equal(linker.text("⟦spells|Ink Blot|BK|ink blot⟧"), "[[Notes/My Ink Blot|ink blot]]");
  assert.ok(linker.has("spells", "Ink Blot", "BK"));
  assert.ok(!linker.has("items", "Ash Ring", "BK"));
  // without chosen notes the match by name is as before
  assert.equal(new Linker("C", notes).note("items", "Ash Ring", "BK"), "C/compendium/items/ash-ring");
});
