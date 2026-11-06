// The 2024 rules: abilities and feats come from backgrounds, and species have lineages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompendium } from "../src/data/build.ts";
import * as E from "../src/rules/engine.ts";
import { read } from "./fixtures/fivetools.ts";
import { srdData } from "./helpers.ts";

const trait = (name: string, text: string) => ({ type: "entries", name, entries: [text] });
const brew = {
  file: "species.json",
  json: {
    _meta: { sources: [{ json: "NEW", full: "New" }] },
    race: [
      {
        name: "Elf", source: "NEW", edition: "one", size: ["M"], speed: 30, darkvision: 60,
        entries: [trait("Elven Lineage", "Choose a lineage."), trait("Trance", "Text.")],
        additionalSpells: [{ name: "Drow", known: { 1: ["dancing lights|xphb#c"] } }, { name: "Wood Elf", known: { 1: ["druidcraft|xphb#c"] } }],
        _versions: [
          { name: "Elf; Drow Lineage", source: "NEW", darkvision: 120, _mod: { entries: { mode: "replaceArr", replace: "Elven Lineage", items: trait("Elven Lineage (Drow)", "Your Darkvision increases to 120 feet.") } } },
          { name: "Elf; Wood Elf Lineage", source: "NEW", speed: 35, _mod: { entries: { mode: "replaceArr", replace: "Elven Lineage", items: trait("Elven Lineage (Wood Elf)", "Woods.") } } },
        ],
      },
      {
        name: "Dragonborn", source: "NEW", edition: "one", size: ["M"], speed: 30,
        entries: [trait("Draconic Ancestry", "Choose."), trait("Breath Weapon", "Breath.")],
        _versions: [{
          _abstract: { name: "Dragonborn ({{color}})", source: "NEW", _mod: { entries: [{ mode: "removeArr", names: "Draconic Ancestry" }, { mode: "replaceArr", replace: "Breath Weapon", items: trait("Breath Weapon", "{{damageType}} breath.") }] } },
          _implementations: [{ _variables: { color: "Black", damageType: "Acid" } }, { _variables: { color: "Red", damageType: "Fire" } }],
        }],
      },
      { name: "Human", source: "NEW", edition: "one", size: ["S", "M"], speed: 30, feats: [{ anyFromCategory: { category: ["O"], count: 1 } }], entries: [trait("Resourceful", "Text.")] },
      { name: "Stout", source: "NEW", edition: "one", size: ["M"], speed: 30, entries: [trait("Toughness", "Your {@variantrule Hit Points|XPHB|Hit Point} maximum increases by 1, and it increases by 1 again whenever you gain a level.")] },
    ],
  },
};
const data = await buildCompendium({ read, edition: "2024", homebrew: [brew] });
data.feats.push({ id: "magic-initiate|xphb", name: "Magic Initiate", source: "XPHB", link: null, prereq: "", ability: [], text: "", category: "O", spells: [{ name: "Cleric Spells", known: { _: [{ choose: "level=0|class=Cleric", count: 2 }] } }, { name: "Wizard Spells", known: { _: [{ choose: "level=0|class=Wizard", count: 2 }] } }] });
const r = new E.Rules(data, E.PROFILE_2024);
const byName = <T extends { name: string }>(l: T[], n: string) => l.find((x) => x.name === n)!;
const acolyte = byName(data.backgrounds, "Acolyte"), elf = data.races.find((x) => x.id === "elf|new")!;

test("a background's ability increases count, once chosen", () => {
  assert.equal(acolyte.ability!.length, 2);
  assert.deepEqual(acolyte.ability![0].choose.map((c) => c.amount), [2, 1]);
  const s = E.newCharacter("A");
  s.ruleset = "5e-2024"; s.background = acolyte.id;
  s.abilities.method = "manual";
  s.abilities.base = { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 12 };
  assert.ok(E.pendingChoices(r, s).includes("Pick 2 background ability score increase(s)"));
  s.backgroundAbility.picks = ["wis", "cha"];
  const sc = E.abilityScores(r, s);
  assert.equal(sc.wis.total, 16);
  assert.equal(sc.wis.background, 2);
  assert.equal(sc.cha.total, 13);
  assert.ok(!E.pendingChoices(r, s).some((p) => p.includes("background ability")));
  s.backgroundAbility = { option: 1, picks: ["int", "wis", "cha"] };
  const even = E.abilityScores(r, s);
  assert.deepEqual([even.int.total, even.wis.total, even.cha.total], [11, 15, 13]);
});

test("a background's feat is offered, added with its spell list, and goes with the background", () => {
  const s = E.newCharacter("A");
  s.background = acolyte.id;
  const g = E.featureGrants(r, s).find((x) => x.kind === "feat")!;
  assert.equal(g.feat, "magic-initiate|xphb");
  assert.equal(g.list, "cleric");
  assert.deepEqual(E.grantSuggestions(r, s, [g]).map((x) => x.text), ["Add the Magic Initiate feat (from Acolyte)"]);
  E.addGrantedFeat(r, s, g);
  assert.equal(s.feats[0].free, true);
  assert.equal(E.asiTaken(s), 0, "doesn't use up an Ability Score Improvement");
  // the list is known, so the player chooses spells and not the list
  const grants = E.featureGrants(r, s);
  assert.ok(!grants.some((x) => x.kind === "variant"));
  assert.deepEqual(grants.filter((x) => x.kind === "spells").map((x) => x.filter?.classes), [["Cleric"]]);
  assert.ok(!E.grantSuggestions(r, s, grants).some((x) => x.grant?.kind === "feat"));
  s.background = null;
  const gone = E.grantSuggestions(r, s, E.featureGrants(r, s));
  assert.deepEqual(gone.filter((x) => x.gone).map((x) => x.text), ["Magic Initiate is no longer granted by Acolyte"]);
});

test("the same feat from two grants keeps a spell list each", () => {
  const s = E.newCharacter("A");
  const g = (key: string, list: string): E.Grant => ({ key, from: "X", kind: "feat", name: "Magic Initiate", feat: "magic-initiate|xphb", list });
  E.addGrantedFeat(r, s, g("a", "cleric"));
  E.addGrantedFeat(r, s, g("b", "wizard"));
  const classes = E.featureGrants(r, s).filter((x) => x.kind === "spells").map((x) => x.filter?.classes?.[0]).sort();
  assert.deepEqual(classes, ["Cleric", "Wizard"]);
});

test("a species' origin feat is chosen from the category, and doesn't take the place of the background's", () => {
  const s = E.newCharacter("A");
  s.race = "human|new"; s.background = acolyte.id;
  const grants = E.featureGrants(r, s).filter((x) => x.kind === "feat");
  assert.deepEqual(grants.map((x) => x.category ?? x.feat), ["magic-initiate|xphb", "O"]);
  assert.deepEqual(E.grantSuggestions(r, s, grants).map((x) => x.text), ["Add the Magic Initiate feat (from Acolyte)", "Choose an origin feat (from Human)"]);
  E.addGrantedFeat(r, s, grants[1], "alert|xphb");
  assert.deepEqual(E.grantSuggestions(r, s, grants).map((x) => x.text), ["Add the Magic Initiate feat (from Acolyte)"]);
});

test("the feats of a race in the 2014 rules stay a bonus feat, not a grant", () => {
  const s = E.newCharacter("A");
  s.race = "human|new";
  assert.ok(!E.featureGrants(new E.Rules(data), s).some((x) => x.kind === "feat"));
});

test("lineages are offered as subraces, with what they change", () => {
  assert.deepEqual(elf.subraces.map((x) => x.name), ["Drow", "Wood Elf"]);
  const [drow, wood] = elf.subraces;
  assert.equal(drow.darkvision, 120);
  assert.equal(wood.speed?.walk, 35);
  assert.deepEqual(drow.traits.map((t) => t.name), ["Elven Lineage (Drow)"]);
  assert.deepEqual(drow.replaces, ["Elven Lineage"]);
  assert.deepEqual(drow.spells?.map((b) => b.name), ["Drow"]);
  assert.equal(elf.spells, null, "the spells are the lineage's");
  assert.equal(elf.subraceRequired, true);
  assert.deepEqual(E.raceTraits(elf, drow).map(({ t }) => t.name), ["Trance", "Elven Lineage (Drow)"]);
});

test("an abstract version is one lineage per implementation", () => {
  const db = data.races.find((x) => x.id === "dragonborn|new")!;
  assert.deepEqual(db.subraces.map((x) => x.name), ["Black", "Red"]);
  assert.match(db.subraces[1].traits[0].text, /Fire breath/);
  assert.deepEqual(E.raceTraits(db, db.subraces[1]).map(({ t }) => t.name), ["Breath Weapon"]);
});

test("a species can give hit points per level", () => {
  const stout = data.races.find((x) => x.id === "stout|new")!;
  assert.equal(stout.hpPerLevel, 1);
  const s = E.newCharacter("A");
  s.race = stout.id;
  s.classes = [{ id: data.classes[0].id, subclass: null, level: 3, hpRolls: [], skills: [] }];
  assert.equal(E.hpBreakdown(r, s).racial, 3);
});

test("what the sheet calls races follows the rules", () => {
  const s = E.newCharacter("A");
  assert.ok(E.pendingChoices(r, s).includes("Choose a species"));
  assert.ok(E.pendingChoices(new E.Rules(srdData()), s).includes("Choose a race"));
});

test("a state from before background abilities reads back with none", () => {
  assert.deepEqual(E.normalize({}).backgroundAbility, { option: 0, picks: [] });
});
