import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompendium, type HomebrewFile } from "../src/data/build.ts";

// A minimal 5etools data folder (one class, two spells) and homebrew files shaped like the ones in
// TheGiddyLimit/homebrew. Names and text are made up.
const spell = (name: string, source: string, level = 1) => ({ name, source, level, school: "V", entries: ["Text."] });
const FILES: Record<string, unknown> = {
  "races.json": { race: [{ name: "Dwarf", source: "PHB", size: ["M"], speed: 25 }], subrace: [] },
  "class/index.json": { wizard: "class-wizard.json" },
  "class/class-wizard.json": {
    class: [{ name: "Wizard", source: "PHB", hd: { faces: 6 }, casterProgression: "full", spellcastingAbility: "int", classFeatures: ["Arcane Study|Wizard||1"] }],
    classFeature: [{ name: "Arcane Study", source: "PHB", className: "Wizard", classSource: "PHB", level: 1, entries: ["Text."] }],
    subclass: [], subclassFeature: [],
  },
  "backgrounds.json": {
    background: [
      { name: "Sage", source: "PHB", srd: true, skillProficiencies: [{ arcana: true }], entries: [{ type: "entries", name: "Feature: Researcher", entries: ["You know where to look."] }] },
      // official copies are resolved too: here a variant that swaps the feature
      { name: "Variant Sage (Archivist)", source: "PHB", _copy: { name: "Sage", source: "PHB", _mod: { entries: { mode: "replaceArr", replace: "Feature: Researcher", items: { type: "entries", name: "Feature: Catalogue", entries: ["You file things."] } } } } },
    ],
  },
  "feats.json": { feat: [] },
  "spells/sources.json": { PHB: { "Spark Bolt": { class: [{ name: "Wizard", source: "PHB" }] } } },
  "spells/index.json": { PHB: "spells-phb.json", XGE: "spells-xge.json" },
  "spells/spells-phb.json": { spell: [spell("Spark Bolt", "PHB"), spell("Quiet Step", "PHB")] },
  "spells/spells-xge.json": { spell: [spell("Frost Needle", "XGE")] },
  "items-base.json": { baseitem: [] },
  "items.json": { item: [{ name: "Ring of Shielding", source: "DMG", rarity: "rare", reqAttune: true, weight: 0.1, bonusAc: "+1", property: ["F"], entries: ["You gain a +1 bonus to AC."] }] },
  "books.json": { book: [{ id: "PHB", name: "Player's Handbook" }, { id: "XGE", name: "Xanathar's Guide to Everything" }, { id: "DMG", name: "Dungeon Master's Guide" }] },
  "adventures.json": { adventure: [] },
};
const read = async (p: string) => structuredClone(FILES[p]);

const BOOK: HomebrewFile = {
  file: "homebrew/Test Book.json",
  json: {
    _meta: { sources: [{ json: "TestBook", full: "The Test Book", abbreviation: "TB" }, { json: "PHB", full: "Not the PHB" }] },
    race: [{ name: "Moss Folk", source: "TestBook", size: ["S"], speed: 25 }],
    subrace: [{ name: "Deep", source: "TestBook", raceName: "Dwarf", raceSource: "PHB" }],
    subclass: [{ name: "School of Ink", shortName: "Ink", source: "TestBook", className: "Wizard", classSource: "PHB", subclassFeatures: ["School of Ink|Wizard||Ink|TestBook|2"] }],
    subclassFeature: [{ name: "School of Ink", source: "TestBook", className: "Wizard", classSource: "PHB", subclassShortName: "Ink", subclassSource: "TestBook", level: 2, entries: ["Text."] }],
    spell: [
      { ...spell("Ink Blot", "TestBook"), classes: { fromClassList: [{ name: "Wizard", source: "PHB" }] } },
      { ...spell("Ink Ward", "TestBook"), classes: { fromClassListVariant: [{ name: "Wizard", source: "PHB", definedInSource: "TestBook" }] } },
    ],
  },
};
// a homebrew class whose spell list is on the class, as "name|source" (PHB when left out) or objects
const CLASS: HomebrewFile = {
  file: "homebrew/Test Class.json",
  json: {
    _meta: { sources: [{ json: "TC", full: "Test Class" }] },
    class: [{
      name: "Warden", source: "TC", hd: { faces: 10 }, casterProgression: "1/2", spellcastingAbility: "wis",
      classSpells: ["quiet step", "frost needle|xge", { name: "Ink Blot", source: "TestBook" }, "missing spell|nowhere"],
    }],
  },
};
const data = await buildCompendium({ read, homebrew: [BOOK, CLASS] });
const spellClasses = (name: string) => data.spells.find((s) => s.name === name)?.classes;

test("without homebrew nothing is added", async () => {
  const plain = await buildCompendium({ read });
  assert.deepEqual(plain.races.map((r) => r.name), ["Dwarf"]);
  assert.deepEqual(plain.classes.map((c) => c.name), ["Wizard"]);
  assert.deepEqual(plain.spells.map((s) => s.name).sort(), ["Frost Needle", "Quiet Step", "Spark Bolt"]);
});

test("homebrew entries are added to the official ones", () => {
  assert.deepEqual(data.races.map((r) => r.name), ["Dwarf", "Moss Folk"]);
  assert.deepEqual(data.races.find((r) => r.name === "Dwarf")!.subraces.map((s) => s.name), ["Deep"]);
  assert.deepEqual(data.classes.map((c) => c.name), ["Warden", "Wizard"]);
  assert.equal(data.spells.length, 5);
});

test("a homebrew subclass of an official class attaches to it, with its features", () => {
  const wizard = data.classes.find((c) => c.name === "Wizard")!;
  assert.deepEqual(wizard.subclasses.map((s) => [s.name, s.source]), [["School of Ink", "TestBook"]]);
  assert.deepEqual(wizard.subclasses[0].features.map((f) => [f.name, f.level]), [["School of Ink", 2]]);
});

test("book names come from _meta.sources, and official books keep their own name", () => {
  assert.equal(data.meta.sources.TestBook, "The Test Book");
  assert.equal(data.meta.sources.TC, "Test Class");
  assert.equal(data.meta.sources.PHB, "Player's Handbook");
});

test("spell class lists: official ones from spells/sources.json", () => {
  assert.deepEqual(spellClasses("Spark Bolt"), ["Wizard"]);
});

test("spell class lists: homebrew spells carry their own (fromClassList and fromClassListVariant)", () => {
  assert.deepEqual(spellClasses("Ink Blot"), ["Wizard", "Warden"]);
  assert.deepEqual(spellClasses("Ink Ward"), ["Wizard"]);
});

test("spell class lists: a homebrew class's classSpells add it to those spells, sources matched in any case", () => {
  assert.deepEqual(spellClasses("Quiet Step"), ["Warden"]);
  assert.deepEqual(spellClasses("Frost Needle"), ["Warden"]);
});

// _copy: homebrew entries that are an official (or other homebrew) entry, changed by _mod
const COPIES: HomebrewFile = {
  file: "homebrew/Copies.json",
  json: {
    _meta: { sources: [{ json: "CP", full: "Copies" }] },
    item: [
      // copies an official item; its own fields win, _mod edits the copied arrays
      { name: "+2 Ring of Shielding", source: "CP", bonusAc: "+2", _copy: { name: "Ring of Shielding", source: "DMG", _mod: { entries: { mode: "replaceTxt", replace: "\\+1", with: "+2" }, property: { mode: "appendIfNotExistsArr", items: ["F", "L"] } } } },
      // a chain of copies, matched in any case
      { name: "Shard (Awakened)", source: "CP", rarity: "very rare", _copy: { name: "ring of shielding", source: "dmg" } },
      { name: "Shard (Exalted)", source: "CP", rarity: "legendary", _copy: { name: "Shard (Awakened)", source: "CP" } },
      // copies of something that isn't there, or of each other, stay as they are
      { name: "Lost Copy", source: "CP", _copy: { name: "Nothing", source: "DMG" } },
      { name: "Loop A", source: "CP", _copy: { name: "Loop B", source: "CP" } },
      { name: "Loop B", source: "CP", _copy: { name: "Loop A", source: "CP" } },
    ],
    background: [
      { name: "Sage Apprentice", source: "CP", _copy: { name: "Sage", source: "PHB", _preserve: { srd: true }, _mod: { entries: [
        { mode: "insertArr", index: 0, items: "Apprentices start small." },
        { mode: "appendArr", items: { type: "entries", name: "Extra", entries: ["More."] } },
      ] } } },
      { name: "Sage Hermit", source: "CP", _copy: { name: "Sage", source: "PHB", _mod: { entries: { mode: "removeArr", names: "Feature: Researcher" } } } },
      { name: "Sage Scout", source: "CP", _copy: { name: "Sage", source: "PHB", _mod: { "*": { mode: "replaceTxt", replace: "LOOK", with: "search", flags: "i" } } } },
    ],
  },
};
const copied = await buildCompendium({ read, homebrew: [COPIES] });
const item = (name: string) => copied.items.find((i) => i.name === name)!;
const background = (name: string) => copied.backgrounds.find((b) => b.name === name)!;

test("_copy: a homebrew item takes the official item's fields, with its own and _mod's changes", () => {
  const it = item("+2 Ring of Shielding");
  assert.equal(it.rarity, "rare");
  assert.equal(it.attunement, true);
  assert.equal(it.weight, 0.1);
  assert.equal(it.bonusAc, 2);
  assert.deepEqual(it.properties, ["finesse", "light"]);
});

test("_copy: chains of copies resolve, and missing or circular copies are kept without failing", () => {
  assert.equal(item("Shard (Exalted)").rarity, "legendary");
  assert.equal(item("Shard (Exalted)").attunement, true);
  assert.equal(item("Shard (Awakened)").weight, 0.1);
  for (const n of ["Lost Copy", "Loop A", "Loop B"]) assert.ok(item(n), n);
});

test("_mod: replaceArr swaps an entry (official copies too), removeArr drops it", () => {
  assert.equal(background("Variant Sage (Archivist)").feature?.name, "Catalogue");
  assert.equal(background("Sage Hermit").feature, null);
  assert.deepEqual(background("Sage Hermit").skills.fixed, ["arcana"]);
});

test("_mod: insertArr and appendArr keep the copied feature", () => {
  assert.equal(background("Sage Apprentice").feature?.name, "Researcher");
});

test("_mod: replaceTxt changes the text, with its flags", () => {
  assert.equal(background("Sage Scout").feature?.text, "You know where to search.");
  assert.equal(background("Sage").feature?.text, "You know where to look.");
});

test("_copy: the SRD flag is only kept when _preserve says so", async () => {
  const srd = await buildCompendium({ read, homebrew: [COPIES], srdOnly: true });
  assert.deepEqual(srd.backgrounds.map((b) => b.name).sort(), ["Sage", "Sage Apprentice"]);
});

test("spell class lists: a class left out of the import adds nothing", async () => {
  const noWarden = await buildCompendium({ read, homebrew: [BOOK, CLASS], keep: (_kind, name) => name !== "Warden" });
  assert.deepEqual(noWarden.spells.find((s) => s.name === "Quiet Step")?.classes, []);
  assert.deepEqual(noWarden.spells.find((s) => s.name === "Ink Blot")?.classes, ["Wizard"]);
});
