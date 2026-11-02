import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { buildCompendium, choiceCounts } from "../src/data/build.ts";
import { srdData } from "./helpers.ts";

const srd = srdData();
const r = new E.Rules(srd);
const id = (list: { id: string; name: string }[], name: string) => list.find((x) => x.name === name)!.id;
const classId = (name: string) => id(srd.classes, name);
/** a character of one class, `skills` its class skills, with the subclass named `sub` */
function char(cls: string, level: number, sub: string | null = null, skills: string[] = []) {
  const s = E.newCharacter("C");
  const c = srd.classes.find((x: E.ClassData) => x.name === cls);
  s.classes = [{ id: c.id, subclass: sub ? c.subclasses.find((x: E.SubclassData) => x.shortName === sub).id : null, level, hpRolls: [], skills }];
  return s;
}
const choice = (s: E.CharState, name: string) => E.characterChoices(r, s).find((c) => c.name === name)!;

test("progressions: by level, from the level they give and at every level", () => {
  const metamagic = choiceCounts({ 3: 2, 10: 3, 17: 4 });
  assert.deepEqual([metamagic[1], metamagic[2], metamagic[9], metamagic[19]], [0, 2, 3, 4]);
  assert.deepEqual(choiceCounts([0, 2, 2]).slice(0, 4), [0, 2, 2, 2]);
  assert.deepEqual(choiceCounts({ "*": 1 }), Array(20).fill(1));
  assert.deepEqual(choiceCounts(undefined), Array(20).fill(0));
});

test("the SRD's choices are shown in the feature that explains them", () => {
  const fighter = srd.classes.find((c: E.ClassData) => c.name === "Fighter");
  assert.deepEqual(fighter.choices.map((c: E.FeatureChoice) => [c.name, c.feature, c.types]), [["Fighting Style", "Fighting Style", ["FS:F"]]]);
  const champion = fighter.subclasses[0];
  assert.equal(champion.choices[0].feature, "Additional Fighting Style");
  assert.equal(champion.choices[0].counts[9], 1);
  assert.ok(srd.optionalFeatures.some((o: E.OptionalFeatureData) => o.name === "Agonizing Blast"));
});

test("Fighting Style: a pick, Character Creation until it is made, and not twice", () => {
  const s = char("Fighter", 10, "Champion");
  const fs = choice(s, "Fighting Style");
  assert.equal(fs.count, 1);
  assert.ok(fs.options.some((o) => o.name === "Defense"));
  assert.ok(E.pendingChoices(r, s).includes("Choose a Fighting Style for Fighter"));
  assert.ok(E.pendingChoices(r, s).includes("Choose a Fighting Style for Fighter (Champion)"));
  s.choices[fs.key] = [id(fs.options, "Defense")];
  assert.ok(!E.pendingChoices(r, s).includes("Choose a Fighting Style for Fighter"));
  const extra = E.characterChoices(r, s).find((c) => c.from === "Fighter (Champion)")!;
  assert.ok(!extra.options.some((o) => o.name === "Defense"), "the same Fighting Style is not offered twice");
  // a lower level keeps the pick for later, without the choice
  s.classes[0].level = 5;
  assert.ok(!E.characterChoices(r, s).some((c) => c.from === "Fighter (Champion)"));
  assert.deepEqual(s.choices[fs.key], [id(fs.options, "Defense")]);
});

test("Eldritch Invocations: picks by level, prerequisites and too many picks", () => {
  const s = char("Warlock", 5);
  const inv = choice(s, "Eldritch Invocations");
  assert.equal(inv.count, 3);
  const thirsting = inv.options.find((o) => o.name === "Thirsting Blade")!;
  assert.equal(thirsting.met, false);
  assert.match(thirsting.prereq, /Pact of the Blade/);
  const pact = choice(s, "Pact Boon");
  s.choices[pact.key] = [id(pact.options, "Pact of the Blade")];
  assert.equal(choice(s, "Eldritch Invocations").options.find((o) => o.name === "Thirsting Blade")!.met, true);
  // Agonizing Blast: the eldritch blast cantrip
  assert.equal(inv.options.find((o) => o.name === "Agonizing Blast")!.met, false);
  s.spells.push({ id: r.spellNamed("Eldritch Blast")!.id, prepared: false });
  assert.equal(choice(s, "Eldritch Invocations").options.find((o) => o.name === "Agonizing Blast")!.met, true);
  s.choices[inv.key] = inv.options.slice(0, 4).map((o) => o.id);
  assert.ok(E.pendingChoices(r, s).includes("Eldritch Invocations (Warlock): 1 more than your level gives — remove one"));
  s.choices[inv.key] = inv.options.slice(0, 1).map((o) => o.id);
  assert.ok(E.pendingChoices(r, s).includes("Choose 2 more Eldritch Invocations for Warlock"));
});

test("Expertise: two of the character's skill proficiencies per feature, counted as expertise", () => {
  const s = char("Rogue", 1, null, ["stealth", "acrobatics"]);
  const ex = choice(s, "Expertise");
  assert.equal(ex.count, 2);
  assert.ok(ex.skills);
  assert.deepEqual(ex.options.map((o) => o.name).sort(), ["Acrobatics", "Stealth", "Thieves' Tools"]);
  assert.ok(E.pendingChoices(r, s).includes("Choose 2 skill(s) for Expertise (Rogue)"));
  s.choices[ex.key] = ["stealth"];
  const d = E.derive(r, s);
  assert.equal(d.skillProf.stealth, 2);
  assert.equal(d.skillProf.acrobatics, 1);
  // a skill set by hand stays as it was set
  s.skills.stealth = 1;
  assert.equal(E.derive(r, s).skillProf.stealth, 1);
  s.classes[0].level = 6;
  assert.equal(choice(s, "Expertise").count, 4);
});

test("Favored Enemy and Natural Explorer: options from their text, more at the levels it names", () => {
  const s = char("Ranger", 1);
  const fe = choice(s, "Favored Enemy");
  assert.equal(fe.count, 1);
  assert.ok(["Aberrations", "Undead", "Two humanoid races"].every((n) => fe.options.some((o) => o.name === n)));
  assert.ok(E.pendingChoices(r, s).includes("Choose a Favored Enemy for Ranger"));
  s.classes[0].level = 6;
  assert.equal(choice(s, "Favored Enemy").count, 2);
  const ne = choice(s, "Natural Explorer");
  assert.equal(ne.count, 2);
  assert.ok(ne.options.some((o) => o.name === "Forest"));
});

test("Draconic Ancestry: a row of its table, with the row as the option's text", () => {
  const s = char("Fighter", 1);
  s.race = id(srd.races, "Dragonborn");
  const da = choice(s, "Draconic Ancestry");
  assert.equal(da.group, s.race);
  assert.equal(da.options.length, 10);
  const black = da.options.find((o) => o.name === "Black")!;
  assert.match(black.text, /Damage Type: Acid/);
  assert.ok(E.pendingChoices(r, s).includes("Choose a Draconic Ancestry for Dragonborn"));
});

test("choices are kept in the note: only lists of option ids", () => {
  const s = E.normalize(JSON.parse(JSON.stringify({ choices: { a: ["x", 2], b: "nope", c: null } })));
  assert.deepEqual(s.choices, { a: ["x", "2"] });
  assert.deepEqual(E.normalize({}).choices, {});
});

test("an option's own choices (Superior Technique's maneuver) come with its pick", () => {
  const data = structuredClone(srd);
  data.optionalFeatures.push(
    { id: "superior-technique|tce", name: "Superior Technique", source: "TCE", link: null, types: ["FS:F"], prereq: "", requires: [], text: "", spells: null,
      choices: [{ name: "Maneuvers", feature: null, counts: Array(20).fill(1), types: ["MV:B"] }] },
    { id: "trip-attack|phb", name: "Trip Attack", source: "PHB", link: null, types: ["MV:B"], prereq: "", requires: [], text: "", spells: null },
  );
  const rr = new E.Rules(data);
  const s = char("Fighter", 1);
  const fs = E.characterChoices(rr, s)[0];
  s.choices[fs.key] = ["superior-technique|tce"];
  const m = E.characterChoices(rr, s).find((c) => c.name === "Maneuvers")!;
  assert.equal(m.parent, fs.key);
  assert.equal(m.feature, "Fighting Style");
  assert.deepEqual(m.options.map((o) => o.name), ["Trip Attack"]);
  assert.ok(E.pendingChoices(rr, s).includes("Choose one of the Maneuvers for Fighter"));
});

test("importer: optional features, progressions and options in a feature's text", async () => {
  const files: Record<string, unknown> = {
    "class/index.json": { x: "class-x.json" },
    "class/class-x.json": {
      class: [{ name: "Duelist", source: "HB", classFeatures: ["Style|Duelist|HB|1", "Stance|Duelist|HB|2"],
        optionalfeatureProgression: [{ name: "Styles", featureType: ["ST"], progression: { 1: 1, 5: 2 } }] }],
      classFeature: [
        { name: "Style", source: "HB", className: "Duelist", level: 1, entries: ["Choose one.", { type: "options", count: 1, entries: [{ type: "refOptionalfeature", optionalfeature: "Riposte|HB" }] }] },
        { name: "Stance", source: "HB", className: "Duelist", level: 2, entries: ["Choose a stance."] },
      ],
      subclass: [{ name: "Way of Steel", shortName: "Steel", source: "HB", className: "Duelist", classSource: "HB", subclassFeatures: ["Way of Steel|Duelist|HB|Steel|HB|3"] }],
      subclassFeature: [
        { name: "Way of Steel", source: "HB", className: "Duelist", subclassShortName: "Steel", level: 3, entries: [{ type: "refSubclassFeature", subclassFeature: "Edge|Duelist|HB|Steel|HB|3" }] },
        { name: "Edge", source: "HB", className: "Duelist", subclassShortName: "Steel", level: 3, entries: [{ type: "options", count: 1, entries: [
          { type: "refSubclassFeature", subclassFeature: "Keen|Duelist|HB|Steel|HB|3" }, { type: "refSubclassFeature", subclassFeature: "Heavy|Duelist|HB|Steel|HB|3" }] }] },
        { name: "Keen", source: "HB", className: "Duelist", subclassShortName: "Steel", level: 3, entries: ["Sharper."] },
        { name: "Heavy", source: "HB", className: "Duelist", subclassShortName: "Steel", level: 3, entries: ["Harder."] },
      ],
    },
    "optionalfeatures.json": { optionalfeature: [
      { name: "Riposte", source: "HB", featureType: ["ST"], entries: ["Strike back."], prerequisite: [{ level: { level: 5, class: { name: "Duelist" } }, spell: ["shield#c"] }] },
      { name: "Lunge", source: "XPHB", featureType: ["ST"], entries: ["Reach."] },
    ] },
  };
  const empty = { race: [], subrace: [], background: [], feat: [], baseitem: [], item: [], book: [], adventure: [] };
  const d = await buildCompendium({ read: async (rel) => files[rel] ?? (rel.endsWith("index.json") || rel.endsWith("sources.json") ? {} : empty), rules2014Only: true });
  assert.deepEqual(d.optionalFeatures!.map((o) => o.name), ["Riposte"], "2024 options are left out");
  assert.deepEqual(d.optionalFeatures![0].requires, [{ level: 5, class: "Duelist", spells: ["shield"] }]);
  assert.equal(d.optionalFeatures![0].prereq, "Level 5 Duelist, Shield");
  const c = d.classes[0];
  assert.deepEqual(c.choices!.map((x) => [x.name, x.feature, x.counts[0], x.counts[4]]), [["Styles", "Style", 1, 2]]);
  const edge = c.subclasses[0].choices![0];
  assert.deepEqual([edge.name, edge.feature, edge.counts[1], edge.counts[2], edge.options!.map((o) => [o.name, o.text])], ["Edge", "Edge", 0, 1, [["Keen", "Sharper."], ["Heavy", "Harder."]]]);
});
