import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompendium, type HomebrewFile } from "../src/data/build.ts";
import { Linker, noteInfoFromText, sourceOfTag } from "../src/data/links.ts";
import * as E from "../src/rules/engine.ts";

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

// subclassSpells: spells added to the class's list for one subclass only
const SUBCLASS_SPELLS: HomebrewFile = {
  file: "homebrew/Subclass Spells.json",
  json: {
    _meta: { sources: [{ json: "SS", full: "Subclass Spells" }] },
    subclass: [
      { name: "School of Quiet", shortName: "Quiet", source: "SS", className: "Wizard", classSource: "PHB",
        // PHB when there is no source, any case, objects too; a wrong source falls back to the name, a missing spell is dropped
        subclassSpells: ["QUIET STEP", "frost needle|xge", { name: "Ink Blot", source: "testbook" }, "spark bolt|nowhere", "missing spell|ss", "quiet step|phb"] },
      { name: "School of Nothing", shortName: "Nothing", source: "SS", className: "Wizard", classSource: "PHB", subclassSpells: ["missing spell|ss"] },
    ],
  },
};
const withSubSpells = await buildCompendium({ read, homebrew: [BOOK, SUBCLASS_SPELLS] });
const wizardSub = (name: string) => withSubSpells.classes.find((c) => c.name === "Wizard")!.subclasses.find((s) => s.shortName === name)!;

test("subclassSpells: a subclass lists its extra spells by id, without changing the spells' class lists", () => {
  assert.deepEqual(wizardSub("Quiet").spells, ["quiet-step|phb", "frost-needle|xge", "ink-blot|testbook", "spark-bolt|phb"]);
  assert.equal(wizardSub("Nothing").spells, undefined);
  assert.equal(wizardSub("Ink").spells, undefined);
  assert.deepEqual(withSubSpells.spells.find((s) => s.name === "Quiet Step")?.classes, []);
});

test("subclassSpells: only a caster with that subclass gets them on its spell list", () => {
  const r = new E.Rules(withSubSpells);
  const wizard = (subclass: string | null) => {
    const s = E.newCharacter("Test");
    s.classes = [{ id: withSubSpells.classes.find((c) => c.name === "Wizard")!.id, subclass, level: 3, hpRolls: [], skills: [] }];
    const [c] = E.casters(r, s);
    return withSubSpells.spells.filter((sp) => E.onSpellList(c, sp)).map((sp) => sp.name).sort();
  };
  assert.deepEqual(wizard(wizardSub("Quiet").id), ["Frost Needle", "Ink Blot", "Ink Ward", "Quiet Step", "Spark Bolt"]);
  assert.deepEqual(wizard(wizardSub("Ink").id), ["Ink Blot", "Ink Ward", "Spark Bolt"]);
  assert.deepEqual(wizard(null), ["Ink Blot", "Ink Ward", "Spark Bolt"]);
});

// What a homebrew file gets wrong is left out and reported; the rest of it still imports
const MESSY: HomebrewFile = {
  file: "homebrew/Messy.json",
  json: {
    _meta: { sources: [{ json: "MS", full: "Messy" }], dependencies: { spell: ["Nowhere"], monster: ["NoBeasts"] } },
    race: [{ name: "Good Folk", source: "MS" }, { name: "No Source" }, "not an entry", null],
    subrace: [{ source: "MS", raceName: "Good Folk", raceSource: "MS", ability: [{ str: 1 }] }],
    feat: { name: "Not in a list", source: "MS" },
    spell: [spell("Good Spell", "MS"), { name: "No Level", source: "MS", school: "V" }],
    item: [{ name: "Good Item", source: "MS" }, { name: "Odd Type", source: "MS", type: 5 }],
    class: [{ name: "Odd Class", source: "MS", classFeatures: [{}, 7, "Arcane Study|Wizard||1"] }],
    subclass: [{ name: "Odd Path", shortName: "Odd", source: "MS", className: "Odd Class", classSource: "MS", subclassFeatures: [{ subclassFeature: "Odd Step|Odd Class|MS|Odd|MS|3" }, 5] }],
    subclassFeature: [{ name: "Odd Step", source: "MS", className: "Odd Class", classSource: "MS", subclassShortName: "Odd", subclassSource: "MS", level: 3, entries: ["Text."] }],
  },
};
const NOT_HOMEBREW: HomebrewFile = { file: "homebrew/List.json", json: [1, 2, 3] };
const warnings: string[] = [];
const messy = await buildCompendium({ read, homebrew: [MESSY, NOT_HOMEBREW], warn: (m) => warnings.push(m) });
const warned = (re: RegExp) => assert.ok(warnings.some((w) => re.test(w)), `no warning like ${re}:\n${warnings.join("\n")}`);

test("left out: a file that isn't homebrew, a collection that isn't a list, entries without name or source", () => {
  warned(/^homebrew\/List\.json: not a 5etools homebrew file/);
  warned(/^homebrew\/Messy\.json: "feat" is not a list/);
  warned(/^homebrew\/Messy\.json: 3 race without a name or source/);
  // an unnamed subrace is fine: it is the race as written
  assert.deepEqual(messy.races.find((r) => r.name === "Good Folk")?.ability.map((a) => a.fixed), [{ str: 1 }]);
});

test("left out: entries the importer can't read, with the rest of the file imported", () => {
  warned(/^spells: left out No Level \(MS\): no spell level/);
  warned(/^items: left out Odd Type \(MS\)/);
  assert.ok(messy.spells.some((s) => s.name === "Good Spell"));
  assert.ok(messy.items.some((i) => i.name === "Good Item"));
  assert.ok(!messy.spells.some((s) => s.name === "No Level"));
});

test("odd feature references are skipped, not fatal", () => {
  const odd = messy.classes.find((c) => c.name === "Odd Class")!;
  // {} and 7 are skipped; the valid reference after them still resolves
  assert.deepEqual(odd.features.map((f) => f.name), ["Arcane Study"]);
  assert.deepEqual(odd.subclasses[0].features.map((f) => f.name), ["Odd Step"]);
});

test("a missing dependency is reported only for what the importer reads", () => {
  warned(/^homebrew\/Messy\.json: uses Nowhere, which is not loaded/);
  assert.ok(!warnings.some((w) => w.includes("NoBeasts")));
  assert.equal(warnings.length, 6, warnings.join("\n"));
});

test("without a warn callback the same files import silently", async () => {
  const quiet = await buildCompendium({ read, homebrew: [MESSY, NOT_HOMEBREW] });
  assert.equal(quiet.spells.length, messy.spells.length);
});

// Compendium notes of homebrew made by ttrpg-convert-cli: its source tag is the 5etools source id,
// lowercased and otherwise as it is ("compendium/src/5e/tc:e")
const EXPANDED: HomebrewFile = {
  file: "homebrew/Test Class Expanded.json",
  json: {
    _meta: { sources: [{ json: "TC:E", full: "Test Class Expanded" }] },
    spell: [{ ...spell("Colon Spell", "TC:E"), entries: ["Works like {@spell ink blot|TestBook}."] }],
  },
};
const note = (alias: string, tag: string) => `---\naliases:\n- "${alias}"\ntags:\n- ${tag}\n- compendium/src/5e\n---\n# ${alias}\n`;
const notes = [
  noteInfoFromText("Compendium/compendium/spells/colon-spell-tc-e", note("Colon Spell", "compendium/src/5e/tc:e")),
  noteInfoFromText("Compendium/compendium/spells/ink-blot-testbook", note("Ink Blot", "compendium/src/5e/testbook")),
  noteInfoFromText("Compendium/compendium/spells/spark-bolt", note("Spark Bolt", "ttrpg-cli/compendium/src/5e/phb")),
].filter((n) => n !== null);

test("source tags: read up to the end of the tag, lowercased", () => {
  assert.equal(sourceOfTag("compendium/src/5e/tc:e"), "tc:e");
  assert.equal(sourceOfTag("compendium/src/5e/TalDoreiCampaignSettingReborn"), "taldoreicampaignsettingreborn");
  assert.equal(sourceOfTag("ttrpg-cli/compendium/src/5e/phb"), "phb");
  assert.equal(sourceOfTag("compendium/src/5e"), null);
  assert.deepEqual(notes.map((n) => n.source), ["tc:e", "testbook", "phb"]);
});

test("homebrew entries link to their notes, also from text, and match only their own source", async () => {
  const linker = new Linker("Compendium", notes);
  const d = linker.attach(await buildCompendium({ read, homebrew: [BOOK, EXPANDED] }));
  const colon = d.spells.find((s) => s.name === "Colon Spell")!;
  assert.equal(colon.link, "Compendium/compendium/spells/colon-spell-tc-e");
  assert.equal(linker.text(colon.text), "Works like [[Compendium/compendium/spells/ink-blot-testbook|ink blot]].");
  assert.ok(linker.has("spells", "Colon Spell", "TC:E"));
  assert.ok(!linker.has("spells", "Colon Spell", "TC"));
});

test("Only entries with a note: homebrew entries are kept by their own source", async () => {
  const linker = new Linker("Compendium", notes);
  const d = await buildCompendium({ read, homebrew: [BOOK, EXPANDED], keep: (kind, name, source) => linker.has(kind, name, source) });
  assert.deepEqual(d.spells.map((s) => `${s.name} (${s.source})`).sort(), ["Colon Spell (TC:E)", "Ink Blot (TestBook)", "Spark Bolt (PHB)"]);
});
