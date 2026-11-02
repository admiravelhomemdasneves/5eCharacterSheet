import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { newEntryId, type CustomEntry } from "../src/custom/format.ts";
import { mergeCustom } from "../src/custom/merge.ts";
import { RULESET_2014 } from "../src/rules/5e-2014/custom.ts";
import { srdData } from "./helpers.ts";

const srd: E.Compendium = srdData();
const entry = (kind: string, name: string, data: Record<string, unknown>, more: Partial<CustomEntry> = {}): CustomEntry =>
  ({ id: newEntryId(`${kind} ${name}`, new Set()), ruleset: "5e-2014", kind, name, data, ...more });
const merge = (...entries: CustomEntry[]) => mergeCustom(srd, { version: 1, entries }, RULESET_2014);
const kind = (k: string) => RULESET_2014.kinds.find((x) => x.kind === k)!;
const CLAWS = "Your claws are natural weapons, which you can use to make unarmed strikes. If you hit with them, you deal slashing damage equal to 1d4 + your Strength modifier.";

test("a custom race: what the sheet works out from it", () => {
  const catfolk = entry("race", "Catfolk", {
    size: ["Small", "Medium"], walk: 35, climb: 20, darkvision: 60,
    abilityFixed: [{ ability: "dex", amount: 2 }], abilityChoose: [{ from: ["wis", "cha"], count: 1, amount: 1 }],
    skills: ["perception"], skillChoices: 1, skillChoiceFrom: ["stealth", "acrobatics"], weapons: "Claws", languages: "Common, Feline",
    traits: [{ name: "Claws", text: CLAWS }, { name: "", text: "no name: left out" }], subraceRequired: false,
  });
  const { data, warnings } = merge(catfolk);
  assert.deepEqual(warnings, []);
  const race = data.races.find((r) => r.name === "Catfolk")!;
  assert.deepEqual([race.size, race.speed, race.darkvision, race.languages, race.weapons.fixed], [["Small", "Medium"], { walk: 35, climb: 20 }, 60, ["Common", "Feline"], ["Claws"]]);
  assert.deepEqual(race.skills, { fixed: ["perception"], choose: [{ from: ["stealth", "acrobatics"], count: 1 }] });
  assert.deepEqual(race.traits.map((t) => t.name), ["Claws"]);
  const r = new E.Rules(data), s = E.newCharacter("C");
  s.race = race.id;
  s.raceAbility = { option: 0, picks: ["cha"] };
  s.classes = [{ id: srd.classes[0].id, subclass: null, level: 1, hpRolls: [], skills: [] }];
  const scores = E.abilityScores(r, s);
  assert.deepEqual([scores.dex.race, scores.cha.race], [2, 1]);
  assert.deepEqual(E.speeds(r, s), { walk: 35, climb: 20 });
  assert.ok(E.pendingChoices(r, s).includes("Pick 1 racial skill proficiency(ies)"));
  // its traits are read like any race's: the claws are an attack to add
  assert.ok(E.derive(r, s).suggestions.some((x) => x.text === "Add the Claws attack (from Catfolk)"));
});

test("subraces: of a race in the data or of a custom one, without changing the data", () => {
  const before = srd.races.find((r) => r.name === "Elf")!.subraces.length;
  const kin = entry("race", "Kin", { size: ["Medium"], walk: 30 });
  const sea = entry("subrace", "Sea", { race: "elf|phb", abilityFixed: [{ ability: "con", amount: 1 }], swim: 30, languages: "Aquan", hpPerLevel: 1, traits: [{ name: "Child of the Sea", text: "You can breathe underwater." }] }, { link: "Notes/Sea Elf" });
  const deep = entry("subrace", "Deep", { race: kin.id, abilityFixed: [{ ability: "str", amount: 2 }], overwriteAbility: true });
  const { data, warnings, links } = merge(sea, deep, kin);
  assert.deepEqual(warnings, []);
  assert.equal(srd.races.find((r) => r.name === "Elf")!.subraces.length, before, "the data it was merged into keeps its own subraces");
  const elf = data.races.find((r) => r.name === "Elf")!;
  const sub = elf.subraces.find((x) => x.name === "Sea")!;
  assert.deepEqual([sub.speed, sub.languages, sub.hpPerLevel, sub.traits.map((t) => t.name), sub.overwriteAbility], [{ swim: 30 }, ["Aquan"], 1, ["Child of the Sea"], false]);
  assert.deepEqual(links, { "races|elf (sea)|custom": "Notes/Sea Elf" });
  assert.deepEqual(data.races.find((r) => r.name === "Kin")!.subraces.map((x) => [x.name, x.overwriteAbility]), [["Deep", true]]);
  const r = new E.Rules(data), s = E.newCharacter("C");
  s.race = elf.id; s.subrace = sub.id;
  s.classes = [{ id: srd.classes[0].id, subclass: null, level: 2, hpRolls: [], skills: [] }];
  const scores = E.abilityScores(r, s);
  assert.deepEqual([scores.dex.race, scores.con.race], [2, 1]);
  assert.equal(E.hpBreakdown(r, s, scores).racial, 2);
  assert.equal(E.speeds(r, s).swim, 30);
});

test("race traits: added to a race or subrace; what is missing is reported", () => {
  const { data, warnings } = merge(
    entry("race-feature", "Stone Sense", { of: "dwarf|phb", text: "You feel the stone." }),
    entry("race-feature", "Moon Song", { of: "elf|phb>elf|high|phb", text: "You sing." }),
    entry("subrace", "Lost", { race: "orc|nowhere" }),
    entry("race-feature", "Ghost Trait", { of: "elf|phb>elf|gone|phb", text: "x" }),
  );
  assert.deepEqual(data.races.find((r) => r.name === "Dwarf")!.traits.at(-1), { name: "Stone Sense", text: "You feel the stone." });
  assert.equal(data.races.find((r) => r.name === "Elf")!.subraces.find((x) => x.name === "High")!.traits.at(-1)!.name, "Moon Song");
  assert.ok(!srd.races.find((r) => r.name === "Dwarf")!.traits.some((t) => t.name === "Stone Sense"), "the data it was merged into is not changed");
  assert.deepEqual(warnings, ["Lost (Subrace): its race (Orc) is not in the rules data", "Ghost Trait (Race trait): its subrace (Gone) is not in the rules data"]);
  assert.equal(kind("race-feature").summary!(entry("race-feature", "x", { of: "elf|phb>elf|high|phb" })), "Trait of Elf (High)");
});

test("manual mode: a race, subrace or trait fills the typed fields", () => {
  const s = E.newCharacter("C");
  kind("race").manual!.fill(entry("race", "Catfolk", { traits: [{ name: "Claws", text: "" }] }), s);
  kind("subrace").manual!.fill(entry("subrace", "Snow", { traits: [{ name: "Cold Paws", text: "" }, { name: "Claws", text: "" }] }), s);
  kind("race-feature").manual!.fill(entry("race-feature", "Purr", {}), s);
  assert.deepEqual([s.manual.race, s.manual.subrace, s.manual.raceFeatures], ["Catfolk", "Snow", ["Claws", "Cold Paws", "Purr"]]);
});

test("a subrace's speeds and darkvision: empty is the race's, shown in the form; a value replaces it", () => {
  const fields = kind("subrace").fields, ctx = { data: srd };
  const ph = (key: string, race = "elf|phb") => {
    const f = fields.find((x) => x.key === key)!;
    return f.type === "number" && typeof f.placeholder === "function" ? f.placeholder({ race }, ctx) : null;
  };
  assert.deepEqual([ph("walk"), ph("darkvision"), ph("fly"), ph("walk", "dwarf|phb")], ["30", "60", "none", "25"]);
  const help = (key: string, race: string) => { const f = fields.find((x) => x.key === key)!; return typeof f.help === "function" ? f.help({ race }, ctx) : f.help; };
  assert.deepEqual([help("walk", "elf|phb"), help("fly", "elf|phb"), help("darkvision", "dwarf|phb"), help("walk", "")],
    ["If left empty: 30 ft. from race Elf.", "If left empty: none from race Elf.", "If left empty: 60 ft. from race Dwarf.", "If left empty: the race's, once one is chosen."]);
  const wood = entry("subrace", "Wood", { race: "elf|phb", walk: 35, fly: null, darkvision: null });
  const { data } = merge(wood);
  const sub = data.races.find((r) => r.name === "Elf")!.subraces.find((x) => x.name === "Wood")!;
  assert.deepEqual([sub.speed, sub.darkvision], [{ walk: 35 }, null]);
  const s = E.newCharacter("C");
  s.race = "elf|phb"; s.subrace = sub.id;
  assert.equal(E.speeds(new E.Rules(data), s).walk, 35);
  assert.equal(E.darkvision(new E.Rules(data), s), 60);
});

test("race traits are for races of the rules data: your own have theirs in their form", () => {
  const def = kind("race-feature");
  const { data } = merge(entry("race", "Catfolk", { size: ["Medium"] }), entry("subrace", "Sea", { race: "elf|phb" }));
  const f = def.fields.find((x) => x.key === "of")!;
  const values = f.type === "select" && typeof f.options === "function" ? f.options({ data }).map((o) => o.value) : [];
  assert.ok(values.includes("dwarf|phb") && values.includes("elf|phb>elf|high|phb"));
  assert.ok(!values.some((v) => v.includes("catfolk") || v.includes("sea|")), "no custom race or subrace");
  assert.equal(def.available!({ data }), null);
  assert.match(def.available!({ data: { ...data, races: data.races.filter((r) => r.source === "Custom") } })!, /races of the SRD or imported rules data/);
});
