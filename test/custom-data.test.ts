import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { CUSTOM_SOURCE, newEntryId, normalizeCustomFile, type CustomEntry, type CustomFile } from "../src/custom/format.ts";
import { emptyData, missingFields } from "../src/custom/schema.ts";
import { mergeCustom } from "../src/custom/merge.ts";
import { loadCustom, saveCustom, type FileAdapter } from "../src/custom/store.ts";
import { RULESET_2014 } from "../src/rules/5e-2014/custom.ts";
import { rulesetById } from "../src/rules/rulesets.ts";
import { srdData } from "./helpers.ts";

const srd: E.Compendium = srdData();
const entry = (kind: string, name: string, data: Record<string, unknown>, more: Partial<CustomEntry> = {}): CustomEntry =>
  ({ id: newEntryId(name, new Set()), ruleset: "5e-2014", kind, name, data, ...more });
const file = (...entries: CustomEntry[]): CustomFile => ({ version: 1, entries });
const merge = (...entries: CustomEntry[]) => mergeCustom(srd, file(...entries), RULESET_2014);
const kind = (k: string) => RULESET_2014.kinds.find((x) => x.kind === k)!;

test("the file: entries without a kind or name are left out, ids made and kept unique", () => {
  const { file: f, warnings } = normalizeCustomFile({ entries: [
    { kind: "feat", name: " Lucky Star ", data: { text: "x" } }, { kind: "feat" }, "nope",
    { id: "a|custom", kind: "spell", name: "Zap", ruleset: "5e-2024", link: "Notes/Zap" }, { id: "a|custom", kind: "item", name: "Rope", data: [] },
  ] });
  assert.deepEqual(f.entries.map((e) => [e.id, e.kind, e.name, e.ruleset, e.link]), [
    ["lucky-star|custom", "feat", "Lucky Star", "5e-2014", undefined], ["a|custom", "spell", "Zap", "5e-2024", "Notes/Zap"], ["rope|custom", "item", "Rope", "5e-2014", undefined],
  ]);
  assert.deepEqual(f.entries[2].data, {}, "data that is not an object is read as empty");
  assert.equal(warnings.length, 3);
  assert.deepEqual(normalizeCustomFile(null), { file: { version: 1, entries: [] }, warnings: [] });
  assert.equal(normalizeCustomFile([1]).warnings.length, 1);
  assert.equal(newEntryId("Fire Bolt!", new Set(["fire-bolt|custom", "fire-bolt-2|custom"])), "fire-bolt-3|custom");
});

test("a form's fields: empty values and the required ones left empty", () => {
  const item = kind("item");
  const d = emptyData(item.fields);
  assert.deepEqual([d.type, d.properties, d.magic, d.weight], ["", [], false, 0]);
  assert.deepEqual(missingFields(item.fields, d), ["Type"]);
  assert.deepEqual(missingFields(kind("spell").fields, { ...emptyData(kind("spell").fields), level: "0", school: "Evocation", text: "Boom." }), []);
});

test("custom entries join the rules data under the Custom source; the data is not changed", () => {
  const before = srd.feats.length;
  const { data, warnings, links } = merge(
    entry("feat", "Keen Eye", { prereq: "Wisdom 13", abilityFixed: [{ ability: "wis", amount: 1 }], abilityChoose: [{ from: ["int", "cha"], count: 1, amount: 1 }], text: "You notice things." }, { link: "Homebrew/Keen Eye" }),
  );
  assert.deepEqual(warnings, []);
  assert.equal(srd.feats.length, before);
  const f = data.feats.find((x) => x.name === "Keen Eye")!;
  assert.deepEqual(f, { id: "keen-eye|custom", name: "Keen Eye", source: CUSTOM_SOURCE, link: null, prereq: "Wisdom 13", text: "You notice things.", spells: null,
    ability: [{ label: "", fixed: { wis: 1 }, choose: [{ from: ["int", "cha"], count: 1, amount: 1 }] }] });
  assert.equal(data.meta.sources[CUSTOM_SOURCE], "Custom data");
  assert.deepEqual(links, { "feats|keen eye|custom": "Homebrew/Keen Eye" });
  // the engine reads it like any feat
  const s = E.newCharacter("C");
  s.feats = [{ id: f.id, picks: ["cha"] }];
  const scores = E.abilityScores(new E.Rules(data), s);
  assert.deepEqual([scores.wis.feat, scores.cha.feat], [1, 1]);
});

test("spells, items and backgrounds become the data the sheet reads", () => {
  const { data } = merge(
    entry("spell", "Frost Lance", { level: "1", school: "Evocation", time: "1 action", range: "60 feet", components: "V, S", duration: "Instantaneous", concentration: false, ritual: true, classes: ["Wizard"], text: "Cold." }),
    entry("item", "Bone Sword", { type: "weapon", weaponCategory: "martial", dmg1: "1d8", dmgType: "slashing", properties: ["versatile"], dmg2: "1d10", weight: 3, value: 15, magic: true, rarity: "rare", bonusWeapon: 1, armorType: "heavy" }),
    entry("item", "Hide Shirt", { type: "armor", armorType: "light", ac: 12, stealth: false, weight: 8, dmg1: "1d4" }),
    entry("background", "Ferryman", { skills: ["athletics", "insight", "nope"], skillChoices: 1, tools: "Vehicles (water), boat kit", languages: "One of your choice", featureName: "River Lore", featureText: "You know rivers." }),
  );
  const sp = data.spells.find((x) => x.name === "Frost Lance")!;
  assert.deepEqual([sp.level, sp.school, sp.ritual, sp.classes], [1, "Evocation", true, ["Wizard"]]);
  const wizard = srd.classes.find((c) => c.name === "Wizard")!;
  const caster = { list: wizard.spellcasting!.list, spells: [] } as unknown as E.CasterInfo;
  assert.ok(E.onSpellList(caster, sp), "on the Wizard's spell list");
  const sword = data.items.find((x) => x.name === "Bone Sword")!;
  assert.deepEqual([sword.kind, sword.dmg1, sword.dmg2, sword.properties, sword.value, sword.bonusWeapon, sword.armorType, sword.rarity], ["weapon", "1d8", "1d10", ["versatile"], 1500, 1, null, "rare"]);
  const shirt = data.items.find((x) => x.name === "Hide Shirt")!;
  assert.deepEqual([shirt.kind, shirt.armorType, shirt.ac, shirt.dmg1, shirt.magic], ["armor", "light", 12, null, false]);
  const bg = data.backgrounds.find((x) => x.name === "Ferryman")!;
  assert.deepEqual([bg.skills, bg.tools.fixed, bg.languages, bg.feature?.name], [{ fixed: ["athletics", "insight"], choose: [{ from: "any", count: 1 }] }, ["Vehicles (water)", "boat kit"], ["One of your choice"], "River Lore"]);
  // equipped, the custom weapon is an attack
  const s = E.newCharacter("C");
  s.abilities.base.str = 10;
  s.inventory = [{ id: sword.id, name: sword.name, qty: 1, weight: 3, equipped: true, attuned: false, notes: "" }];
  assert.equal(E.attacks(new E.Rules(data), s)[0].damage, "1d8+1 (1d10+1 two-handed) slashing");
});

test("what is left out: entries of other rules, unknown kinds and taken ids", () => {
  const { data, warnings, other } = merge(
    entry("feat", "New Rules Feat", { text: "x" }, { ruleset: "5e-2024" }),
    entry("monster", "Owlbear", {}),
    entry("feat", "Grappler Copy", { text: "x" }, { id: "grappler|phb" }),
  );
  assert.equal(other, 1);
  assert.ok(!data.feats.some((f) => f.name === "New Rules Feat"));
  assert.deepEqual(warnings, ['Grappler Copy (Feat): another entry has the same id', 'Owlbear: "monster" is not a kind of entry of these rules, so it is left out.']);
  assert.equal(data.feats.filter((f) => f.id === "grappler|phb").length, 1);
});

test("manual mode: an entry fills the typed fields", () => {
  const s = E.newCharacter("C");
  kind("spell").manual!.fill(entry("spell", "Frost Lance", { level: "1" }), s);
  kind("feat").manual!.fill(entry("feat", "Keen Eye", {}), s);
  kind("item").manual!.fill(entry("item", "Rope of Bones", { weight: 2 }), s);
  kind("background").manual!.fill(entry("background", "Ferryman", { featureName: "River Lore" }), s);
  assert.deepEqual(s.manual.spells, [{ name: "Frost Lance", level: 1, prepared: false }]);
  assert.deepEqual(s.manual.feats, ["Keen Eye"]);
  assert.deepEqual(s.inventory.map((i) => [i.id, i.name, i.weight]), [[null, "Rope of Bones", 2]]);
  assert.deepEqual([s.manual.background, s.manual.raceFeatures], ["Ferryman", ["River Lore"]]);
  assert.equal(rulesetById("unknown").id, "5e-2014");
});

test("the file in the vault: written with its folders, read back, and left alone when it isn't JSON", async () => {
  const files = new Map<string, string>(), dirs = new Set<string>();
  const a: FileAdapter = {
    exists: async (p) => files.has(p) || dirs.has(p), read: async (p) => files.get(p)!,
    write: async (p, d) => { files.set(p, d); }, mkdir: async (p) => { dirs.add(p); },
  };
  const path = ".5e-character-sheet/sub/custom-data.json";
  assert.deepEqual((await loadCustom(a, path)).file.entries, []);
  const f = file(entry("feat", "Keen Eye", { text: "x" }));
  await saveCustom(a, path, f);
  assert.deepEqual([...dirs], [".5e-character-sheet", ".5e-character-sheet/sub"]);
  assert.match(files.get(path)!, /\n {2}"entries"/);
  assert.deepEqual((await loadCustom(a, path)).file, f);
  files.set(path, "{ nope");
  const bad = await loadCustom(a, path);
  assert.deepEqual(bad.file.entries, []);
  assert.match(bad.error!, /is not valid JSON/);
});
