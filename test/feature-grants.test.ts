import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { buildCompendium } from "../src/data/build.ts";
import { srdData } from "./helpers.ts";

const srd = srdData();
const r = new E.Rules(srd);
const named = <T extends { name: string }>(list: T[], name: string) => list.find((x) => x.name === name)!;
/** a character of one class and race (`sub`: its subrace or subclass by name) */
function char(race: string, cls: string, level: number, o: { subrace?: string; subclass?: string } = {}) {
  const s = E.newCharacter("C");
  const rc = named<E.RaceData>(srd.races, race), c = named<E.ClassData>(srd.classes, cls);
  s.race = rc.id;
  s.subrace = o.subrace ? named(rc.subraces, o.subrace).id : null;
  s.classes = [{ id: c.id, subclass: o.subclass ? c.subclasses.find((x) => x.shortName === o.subclass)!.id : null, level, hpRolls: [], skills: [] }];
  s.abilities.base = { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 };
  return s;
}
const suggestions = (s: E.CharState, rr = r) => E.derive(rr, s).suggestions;
const texts = (s: E.CharState, rr = r) => suggestions(s, rr).map((x) => x.text);
const grant = (s: E.CharState, text: string | RegExp, rr = r) => suggestions(s, rr).find((x) => (typeof text === "string" ? x.text === text : text.test(x.text)))!.grant!;

test("spell filters: what a granted spell may be, in words", () => {
  const f = E.spellFilter("level=0|class=Wizard");
  assert.deepEqual(f, { levels: [0], classes: ["Wizard"], schools: null, ritual: false });
  assert.equal(E.filterText(f), "Wizard cantrip");
  assert.equal(E.filterText(f, 2), "Wizard cantrips");
  assert.equal(E.filterText(E.spellFilter("level=1|school=E;D")), "1st-level enchantment or divination spell");
  assert.equal(E.filterText(E.spellFilter("level=1|class=Bard|components & miscellaneous=ritual")), "1st-level Bard ritual spell");
  assert.equal(E.filterText(E.spellFilter("level=0;1;2;3"), 2), "cantrips or 1st–3rd-level spells");
  const sp = (name: string) => r.spellNamed(name)!;
  assert.ok(E.spellMatches(sp("Fire Bolt"), f));
  assert.ok(!E.spellMatches(sp("Sacred Flame"), f));
  assert.ok(!E.spellMatches(sp("Magic Missile"), f));
  assert.ok(E.spellMatches(sp("Charm Person"), E.spellFilter("level=1|school=E;D")));
  assert.ok(E.spellMatches(sp("Alarm"), E.spellFilter("level=1|class=Wizard|components & miscellaneous=ritual")));
  assert.ok(!E.spellMatches(sp("Magic Missile"), E.spellFilter("level=1|class=Wizard|components & miscellaneous=ritual")));
});

test("Tiefling: its innate spells come at the levels they are granted", () => {
  const s = char("Tiefling", "Fighter", 2);
  const names = () => E.grantedSpells(r, s).map((g) => r.spell(g.id)!.name);
  assert.deepEqual(names(), ["Thaumaturgy"]);
  s.classes[0].level = 5;
  assert.deepEqual(names(), ["Thaumaturgy", "Hellish Rebuke", "Darkness"]);
  assert.deepEqual(texts(s), [], "granted spells are not suggested");
});

test("High Elf: a Wizard cantrip to choose, flagged once the subrace goes", () => {
  const s = char("Elf", "Fighter", 1, { subrace: "High" });
  const g = grant(s, "Choose a Wizard cantrip (from Elf (High))");
  assert.equal(g.kind, "spells");
  assert.equal(g.count, 1);
  s.spells.push({ id: r.spellNamed("Fire Bolt")!.id, prepared: true, grant: g.key, from: g.from });
  assert.deepEqual(texts(s), []);
  const row = E.derive(r, s).spells.find((x) => x.data!.name === "Fire Bolt")!;
  assert.equal(row.gone, false);
  // the cantrip does not count as one of a class's
  assert.equal(E.casterSpellCounts(r, s, s.classes[0].id).cantrips, 0);
  s.subrace = null;
  const gone = suggestions(s);
  assert.deepEqual(gone.map((x) => x.text), ["Fire Bolt is no longer granted by Elf (High)"]);
  assert.deepEqual(gone[0].gone, { spell: r.spellNamed("Fire Bolt")!.id });
  assert.equal(E.derive(r, s).spells.find((x) => x.data!.name === "Fire Bolt")!.gone, true);
});

test("Dragonborn: the breath weapon attack, by level and ancestry, and its uses", () => {
  const s = char("Dragonborn", "Fighter", 5);
  assert.deepEqual(texts(s).filter((t) => /Breath/.test(t)), ["Add the Breath Weapon attack (from Dragonborn)", "Track the uses of Breath Weapon (from Dragonborn)"]);
  const atk = grant(s, /Breath Weapon attack/).attack!;
  // DC 8 + CON (+2) + proficiency (+3)
  assert.deepEqual([atk.toHit, atk.save, atk.damage], [null, "DC 13", "2d6"]);
  const anc = E.characterChoices(r, s).find((c) => c.name === "Draconic Ancestry")!;
  s.choices[anc.key] = [anc.options.find((o) => o.name === "Black")!.id];
  s.classes[0].level = 6;
  const g = grant(s, /Breath Weapon attack/);
  assert.deepEqual([g.attack!.save, g.attack!.damage], ["DC 13 Dex", "3d6 acid"]);
  assert.match(g.attack!.notes, /5 by 30 ft\. line/);
  s.added.push({ key: g.key, kind: "attack", name: g.name, from: g.from });
  const uses = grant(s, /uses of Breath Weapon/);
  assert.deepEqual([uses.max, uses.rest], [1, "short"]);
  s.added.push({ key: uses.key, kind: "resource", name: uses.name, from: uses.from });
  const d = E.derive(r, s);
  assert.deepEqual(d.suggestions.filter((x) => /Breath/.test(x.text)), []);
  const row = d.attacks.find((a) => a.name === "Breath Weapon")!;
  assert.deepEqual([row.save, row.damage, row.from, row.gone], ["DC 13 Dex", "3d6 acid", "Dragonborn", undefined]);
  assert.deepEqual(d.resources.find((x) => x.grant === uses.key), { key: `grant:${uses.key}`, label: "Breath Weapon (short or long rest)", max: 1, from: "Dragonborn", grant: uses.key, gone: false });
  // another race: both are flagged, the attack kept by name
  s.race = named<E.RaceData>(srd.races, "Human").id;
  const after = E.derive(r, s);
  assert.deepEqual(after.attacks.find((a) => a.name === "Breath Weapon")!.gone, true);
  assert.ok(after.suggestions.some((x) => x.text === "Breath Weapon is no longer granted by Dragonborn"));
});

test("Half-Orc: Relentless Endurance's use, dismissed for good", () => {
  const s = char("Half-Orc", "Fighter", 1);
  const g = grant(s, "Track the uses of Relentless Endurance (from Half-Orc)");
  assert.deepEqual([g.max, g.rest], [1, "long"]);
  s.dismissed.push(g.key);
  assert.ok(!texts(s).some((t) => /Relentless/.test(t)));
});

test("Circle of the Land: the land to pick before its spells are granted", () => {
  const s = char("Human", "Druid", 3, { subclass: "Land" });
  const g = grant(s, "Choose the spell list of Druid (Circle of the Land)");
  assert.equal(g.kind, "variant");
  assert.ok(g.variants!.includes("Arctic"));
  assert.ok(!E.grantedSpells(r, s).some((x) => r.spell(x.id)!.name === "Hold Person"), "no land's spells before one is picked");
  s.choices[g.key] = ["Arctic"];
  assert.deepEqual(E.grantedSpells(r, s).map((x) => r.spell(x.id)!.name), ["Hold Person", "Spike Growth"]);
  assert.ok(texts(s).includes("Choose a Druid cantrip (from Druid (Circle of the Land))"));
});

test("Armor of Shadows: Mage Armor to add; once the invocation goes, the player removes or keeps it", () => {
  const s = char("Human", "Warlock", 2);
  const inv = E.characterChoices(r, s).find((c) => c.name === "Eldritch Invocations")!;
  s.choices[inv.key] = [named(inv.options, "Armor of Shadows").id];
  const g = grant(s, "Add Mage Armor (from Armor of Shadows)");
  s.spells.push({ id: g.spell!, prepared: true, grant: g.key, from: g.from });
  assert.deepEqual(texts(s).filter((t) => /Mage Armor/.test(t)), []);
  s.choices[inv.key] = [];
  assert.ok(texts(s).includes("Mage Armor is no longer granted by Armor of Shadows"));
});

test("added grants and dismissed ones are kept in the note", () => {
  const s = E.normalize(JSON.parse(JSON.stringify({ added: [{ key: "k", kind: "resource", name: "N", from: "F" }, { kind: "attack" }, null, { key: "a", kind: "x" }], dismissed: ["d", 3] })));
  assert.deepEqual(s.added, [{ key: "k", kind: "resource", name: "N", from: "F" }, { key: "a", kind: "attack", name: "", from: "" }]);
  assert.deepEqual(s.dismissed, ["d", "3"]);
  assert.deepEqual([E.normalize({}).added, E.normalize({}).dismissed], [[], []]);
});

test("feats: the spells they grant, from the list the player picks", async () => {
  const files: Record<string, unknown> = {
    "feats.json": { feat: [
      { name: "Touched", source: "HB", entries: ["Magic."], additionalSpells: [{ innate: { _: { daily: { "1e": ["misty step", { choose: "level=1|school=E;D" }] } } } }] },
      { name: "Initiate", source: "HB", entries: ["Magic."], additionalSpells: [
        { name: "Wizard Spells", known: { _: [{ choose: "level=0|class=Wizard", count: 2 }] } }, { name: "Cleric Spells", known: { _: [{ choose: "level=0|class=Cleric", count: 2 }] } }] },
    ] },
  };
  const empty = { race: [], subrace: [], background: [], feat: [], baseitem: [], item: [], book: [], adventure: [], spell: [] };
  const d = await buildCompendium({ read: async (rel) => files[rel] ?? (rel.endsWith("index.json") || rel.endsWith("sources.json") ? {} : empty) });
  const data = { ...srd, feats: d.feats };
  const rr = new E.Rules(data);
  const s = char("Human", "Fighter", 4);
  s.feats = d.feats.map((f) => ({ id: f.id, picks: [] }));
  assert.deepEqual(texts(s, rr), ["Choose the spell list of Initiate", "Add Misty Step (from Touched)", "Choose a 1st-level enchantment or divination spell (from Touched)"]);
  const list = grant(s, /spell list of Initiate/, rr);
  s.choices[list.key] = ["Cleric Spells"];
  assert.ok(texts(s, rr).includes("Choose 2 Cleric cantrips (from Initiate)"));
  const g = grant(s, /Cleric cantrips/, rr);
  s.spells.push({ id: r.spellNamed("Sacred Flame")!.id, prepared: true, grant: g.key, from: g.from });
  assert.ok(texts(s, rr).includes("Choose a Cleric cantrip (from Initiate)"));
  // another list: the cantrip chosen from the first is flagged
  s.choices[list.key] = ["Wizard Spells"];
  assert.ok(texts(s, rr).includes("Sacred Flame is no longer granted by Initiate"));
});
