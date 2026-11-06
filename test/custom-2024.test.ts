// Custom entries under the 2024 rules: their forms have what those rules have, and it works on a sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CustomEntry } from "../src/custom/format.ts";
import { mergeCustom } from "../src/custom/merge.ts";
import * as E from "../src/rules/engine.ts";
import { RULESET_2014 } from "../src/rules/5e-2014/custom.ts";
import { RULESET_2024 } from "../src/rules/5e-2024/custom.ts";
import { rulesetById } from "../src/rules/rulesets.ts";

const empty: E.Compendium = { meta: { sources: {} }, races: [], classes: [], backgrounds: [], feats: [], spells: [], items: [] };
const entry = (id: string, kind: string, name: string, data: Record<string, unknown>, ruleset = "5e-2024"): CustomEntry => ({ id, ruleset, kind, name, data });
const kind = (k: string) => RULESET_2024.kinds.find((x) => x.kind === k)!;
const keys = (k: string) => kind(k).fields.map((f) => f.key);
const merged = (entries: CustomEntry[]) => mergeCustom(empty, { version: 1, entries }, RULESET_2024);

test("the forms follow the rules", () => {
  assert.deepEqual(kind("race").label, ["Species", "Species"]);
  assert.deepEqual(kind("subrace").label[0], "Lineage");
  assert.ok(!keys("race").includes("abilityFixed") && !keys("race").includes("abilityChoose"), "no ability increases on species");
  assert.ok(keys("race").includes("originFeat") && keys("race").includes("hpPerLevel"));
  assert.ok(!keys("subrace").includes("abilityFixed") && !keys("subrace").includes("overwriteAbility"));
  assert.ok(keys("background").includes("abilityFrom") && keys("background").includes("originFeat"));
  assert.ok(!keys("background").includes("featureName"));
  assert.ok(keys("feat").includes("category"));
  assert.ok(keys("item").includes("mastery"));
  assert.ok(keys("class").includes("preparedByLevel") && keys("class").includes("weaponMasteries") && !keys("class").includes("preparedCount"));
});

test("the 2014 forms don't change", () => {
  const k14 = (k: string) => RULESET_2014.kinds.find((x) => x.kind === k)!;
  assert.deepEqual(k14("race").label, ["Race", "Races"]);
  assert.ok(k14("race").fields.some((f) => f.key === "abilityFixed"));
  assert.ok(k14("background").fields.some((f) => f.key === "featureName"));
  assert.ok(!k14("background").fields.some((f) => f.key === "abilityFrom"));
  assert.ok(!k14("item").fields.some((f) => f.key === "mastery"));
  assert.ok(k14("class").fields.some((f) => f.key === "preparedCount"));
});

test("each kind of both rules is there, so an entry can change rules", () => {
  assert.deepEqual(RULESET_2024.kinds.map((k) => k.kind), RULESET_2014.kinds.map((k) => k.kind));
  assert.equal(rulesetById("5e-2024"), RULESET_2024);
});

test("a species gives hit points and an origin feat", () => {
  const { data, warnings } = merged([entry("moss|custom", "race", "Moss Folk", { size: ["Medium"], hpPerLevel: 1, originFeat: true })]);
  assert.deepEqual(warnings, []);
  const r = data.races[0];
  assert.equal(r.hpPerLevel, 1);
  assert.deepEqual(r.ability, []);
  const s = E.newCharacter("A");
  s.race = r.id;
  const rules = new E.Rules(data, E.PROFILE_2024);
  assert.deepEqual(E.featureGrants(rules, s).filter((g) => g.kind === "feat").map((g) => g.category), ["O"]);
});

test("a background gives its ability increases and origin feat", () => {
  const { data } = merged([
    entry("sailor|custom", "background", "Sailor", { abilityFrom: ["str", "dex", "wis"], originFeat: "brave|custom", skills: ["athletics"] }),
    entry("brave|custom", "feat", "Brave", { category: "O", text: "Text." }),
  ]);
  const b = data.backgrounds[0];
  assert.deepEqual(b.ability!.map((o) => o.label), ["+2 / +1", "+1 / +1 / +1"]);
  assert.deepEqual(b.originFeats, [{ id: "brave|custom" }]);
  assert.equal(data.feats[0].category, "O");
  const s = E.newCharacter("A");
  s.background = b.id; s.backgroundAbility.picks = ["str", "wis"];
  s.abilities.method = "manual";
  s.abilities.base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const rules = new E.Rules(data, E.PROFILE_2024);
  assert.equal(E.abilityScores(rules, s).str.total, 12);
  assert.equal(E.abilityScores(rules, s).wis.total, 11);
  assert.deepEqual(E.featureGrants(rules, s).filter((g) => g.kind === "feat").map((g) => g.name), ["Brave"]);
});

test("a class prepares by its table, has half casting from level 1, and masters weapons", () => {
  const { data, warnings } = merged([
    entry("axe|custom", "item", "Great Axe", { type: "weapon", weaponCategory: "martial", dmg1: "1d12", mastery: "Cleave" }),
    entry("oath|custom", "class", "Oathkeeper", { hd: "10", castingAbility: "cha", progression: "artificer", preparation: "prepared", preparedByLevel: "1: 2, 5: 6", weaponMasteries: "1: 2, 4: 3" }),
  ]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(data.items[0].mastery, ["Cleave"]);
  const c = data.classes[0];
  assert.equal(c.spellcasting!.prepared, null);
  const s = E.newCharacter("A");
  s.classes = [{ id: c.id, subclass: null, level: 5, hpRolls: [], skills: [] }];
  const rules = new E.Rules(data, E.PROFILE_2024);
  assert.equal(E.casters(rules, s)[0].prepared, 6);
  s.classes[0].level = 1;
  assert.equal(E.spellSlots(rules, s).max[0], 2);
  const mastery = c.choices!.find((x) => x.name === "Weapon Mastery")!;
  assert.deepEqual([mastery.counts[0], mastery.counts[3]], [2, 3]);
});

test("an entry is only in the data of its rules", () => {
  const entries = [entry("a|custom", "feat", "Old", { text: "x" }, "5e-2014"), entry("b|custom", "feat", "New", { text: "x" })];
  assert.deepEqual(mergeCustom(empty, { version: 1, entries }, RULESET_2014).data.feats.map((f) => f.name), ["Old"]);
  assert.deepEqual(mergeCustom(empty, { version: 1, entries }, RULESET_2024).data.feats.map((f) => f.name), ["New"]);
});
