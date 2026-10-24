import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as E from "../src/rules/engine.ts";
import { hasPersonal, personalData, srdData, VAULT } from "./helpers.ts";

// The rules are tested on the SRD 5.1 data in the repository. The few tests that need entries the SRD
// leaves out use the personal (non-SRD) dataset, and are skipped where it does not exist.
const data: any = srdData();
const r = new E.Rules(data);
const personal: any = personalData();
const personalTest = (name: string, fn: () => void) => test(name, { skip: !hasPersonal && "personal dataset not available" }, fn);
const id = (list: { id: string; name: string; source: string }[], name: string, source = "PHB") => {
  const x = list.find((y) => y.name === name && y.source === source);
  assert.ok(x, `missing ${name} (${source})`);
  return x.id;
};
const cls = (name: string, level: number, extra: Partial<E.ClassEntry> = {}, d: any = data): E.ClassEntry => ({ id: id(d.classes, name), subclass: null, level, hpRolls: [], skills: [], ...extra });

function hillDwarfWizard5() {
  const s = E.newCharacter("Test");
  s.race = id(data.races, "Dwarf");
  s.subrace = data.races.find((x: any) => x.id === s.race).subraces.find((x: any) => x.name === "Hill").id;
  s.abilities.method = "manual";
  s.abilities.base = { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 };
  s.classes = [cls("Wizard", 5)];
  return s;
}

test("racial ability bonuses: hill dwarf gets CON +2 and WIS +1", () => {
  const sc = E.abilityScores(r, hillDwarfWizard5());
  assert.equal(sc.con.total, 15);
  assert.equal(sc.wis.total, 13);
  assert.equal(sc.int.total, 16);
});

test("wizard 5 with INT 16: DC 14, attack +6, slots 4/3/2, prepared = 5 + 3", () => {
  const s = hillDwarfWizard5();
  const [c] = E.casters(r, s);
  assert.equal(c.dc, 14);
  assert.equal(c.attack, 6);
  assert.equal(c.prepared, 8);
  assert.equal(c.cantrips, 4);
  assert.deepEqual(E.spellSlots(r, s).max.slice(0, 4), [4, 3, 2, 0]);
});

test("hit points: hill dwarf wizard 5, CON 15 => 6 + 4*4 + 5*2 + 5 = 37", () => {
  assert.equal(E.hpBreakdown(r, hillDwarfWizard5()).max, 37);
});

test("fighter 3 with CON 14 => 10 + 2*6 + 3*2 = 28", () => {
  const s = E.newCharacter();
  s.abilities.method = "manual";
  s.abilities.base = { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
  s.classes = [cls("Fighter", 3)];
  assert.equal(E.hpBreakdown(r, s).max, 28);
});

test("multiclass slots: paladin 2 / sorcerer 3 = caster level 4 => 4/3", () => {
  const s = E.newCharacter();
  s.classes = [cls("Paladin", 2), cls("Sorcerer", 3)];
  const sl = E.spellSlots(r, s);
  assert.equal(sl.casterLevel, 4);
  assert.deepEqual(sl.max.slice(0, 3), [4, 3, 0]);
});

test("single-class half caster: paladin 3 has three 1st-level slots", () => {
  const s = E.newCharacter();
  s.classes = [cls("Paladin", 3)];
  assert.deepEqual(E.spellSlots(r, s).max.slice(0, 2), [3, 0]);
});

// the SRD has no third caster
personalTest("eldritch knight 7 => 4/2 slots", () => {
  const s = E.newCharacter();
  const f = personal.classes.find((c: any) => c.name === "Fighter");
  s.classes = [cls("Fighter", 7, { subclass: f.subclasses.find((x: any) => x.shortName === "Eldritch Knight").id }, personal)];
  assert.deepEqual(E.spellSlots(new E.Rules(personal), s).max.slice(0, 3), [4, 2, 0]);
});

test("warlock pact slots are separate", () => {
  const s = E.newCharacter();
  s.classes = [cls("Warlock", 5)];
  const sl = E.spellSlots(r, s);
  assert.equal(sl.casterLevel, 0);
  assert.deepEqual(sl.pact, { slots: 2, level: 3 });
});

test("slot adjustments add or remove slots per level", () => {
  const s = hillDwarfWizard5();
  s.slots.adjust[0] = -1; s.slots.adjust[3] = 1;
  assert.deepEqual(E.spellSlots(r, s).max.slice(0, 4), [3, 3, 2, 1]);
});

test("slots by the rules next to the sheet's: every level either has, and where they differ", () => {
  const s = hillDwarfWizard5();
  assert.deepEqual(E.slotsByRules(E.spellSlots(r, s)), [
    { level: 1, rules: 4, sheet: 4, differs: false }, { level: 2, rules: 3, sheet: 3, differs: false }, { level: 3, rules: 2, sheet: 2, differs: false },
  ]);
  // 2nd level stepped down to 0 (it leaves the grid, not this list) and a 4th-level slot added
  s.slots.adjust[1] = -3; s.slots.adjust[3] = 1;
  assert.deepEqual(E.slotsByRules(E.spellSlots(r, s)).filter((l) => l.differs), [
    { level: 2, rules: 3, sheet: 0, differs: true }, { level: 4, rules: 0, sheet: 1, differs: true },
  ]);
  assert.deepEqual(E.slotsByRules(E.spellSlots(r, E.newCharacter())), []);
});

test("point buy: 15/15/15/8/8/8 = 27 points", () => {
  assert.deepEqual(E.pointBuySpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }), { spent: 27, remaining: 0, valid: true });
  assert.equal(E.pointBuySpent({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }).valid, false);
});

test("AC: studded leather with DEX 16 = 15; barbarian unarmored uses CON", () => {
  const s = E.newCharacter();
  s.abilities.method = "manual";
  s.abilities.base = { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 10 };
  s.inventory = [{ id: id(data.items, "Studded Leather Armor"), name: "Studded Leather Armor", qty: 1, weight: 13, equipped: true, attuned: false, notes: "" }];
  assert.equal(E.armorClass(r, s).value, 15);
  s.inventory[0].equipped = false;
  s.classes = [cls("Barbarian", 1)];
  assert.equal(E.armorClass(r, s).value, 15); // 10 + 3 + 2
  s.inventory.push({ id: id(data.items, "Shield"), name: "Shield", qty: 1, weight: 6, equipped: true, attuned: false, notes: "" });
  assert.equal(E.armorClass(r, s).value, 17);
});

test("life domain grants its domain spells as always prepared", () => {
  const s = E.newCharacter();
  const c = data.classes.find((x: any) => x.name === "Cleric");
  s.classes = [cls("Cleric", 3, { subclass: c.subclasses.find((x: any) => x.shortName === "Life").id })];
  const names = E.grantedSpells(r, s).map((g) => r.spell(g.id)!.name).sort();
  assert.deepEqual(names, ["Bless", "Cure Wounds", "Lesser Restoration", "Spiritual Weapon"]);
});

test("prepared spells are listed first", () => {
  const s = hillDwarfWizard5();
  const sp = (n: string) => id(data.spells, n);
  s.spells = [{ id: sp("Magic Missile"), prepared: false }, { id: sp("Fireball"), prepared: true }, { id: sp("Shield"), prepared: false }];
  assert.deepEqual(E.sortedSpells(r, s).map((x) => x.data!.name), ["Fireball", "Magic Missile", "Shield"]);
});

test("class features up to level, with subclass features replacing placeholders", () => {
  const s = hillDwarfWizard5();
  const w = data.classes.find((x: any) => x.name === "Wizard");
  s.classes[0].subclass = w.subclasses.find((x: any) => x.shortName === "Evocation").id;
  const names = E.classFeatures(r, s)[0].features.map((f) => f.name);
  assert.ok(names.includes("Arcane Recovery"));
  assert.ok(names.includes("Sculpt Spells"));
  assert.ok(!names.includes("Potent Cantrip")); // level 6
  assert.ok(!names.includes("Arcane Tradition feature"));
});

test("skills: background proficiencies and expertise", () => {
  const s = hillDwarfWizard5();
  s.background = id(data.backgrounds, "Acolyte");
  const sk = E.skillProficiencies(r, s);
  assert.equal(sk.insight, 1);
  assert.equal(sk.religion, 1);
  assert.equal(sk.arcana, 0);
  s.skills.religion = 2;
  assert.equal(E.skillBonus(r, s, "religion"), 3 + 2 * 3);
});

test("multiclass requirements", () => {
  const s = hillDwarfWizard5();
  const sc = E.abilityScores(r, s);
  assert.equal(E.multiclassRequirementsMet(r, data.classes.find((c: any) => c.name === "Paladin"), sc).ok, false);
  assert.equal(E.multiclassRequirementsMet(r, data.classes.find((c: any) => c.name === "Rogue"), sc).ok, true);
});

test("monk resources come from the class table", () => {
  const s = E.newCharacter();
  s.classes = [cls("Monk", 5)];
  const ki = E.classResources(r, s).find((x) => x.label === "Ki Points");
  assert.equal(ki?.max, 5);
});

test("ASI taken as an entry in Feats: +1/+1 or +2, counted against class ASIs", () => {
  const s = hillDwarfWizard5();
  s.feats = [{ id: E.ASI_ID, picks: ["int", "int"] }];
  assert.equal(E.abilityScores(r, s).int.total, 18);
  assert.equal(E.asiSlots(r, s), 1);
  assert.equal(E.asiTaken(s), 1);
  s.feats.push({ id: id(data.feats, "Grappler"), picks: [], free: true });
  assert.equal(E.asiTaken(s), 1); // bonus (racial) feats don't use an ASI
  assert.ok(!E.pendingChoices(r, s).some((p) => /Ability Score Improvement/.test(p)));
});

test("old sheets with ASI points on the scores are migrated to ASI entries", () => {
  const old = hillDwarfWizard5();
  old.version = 1; old.abilities.asi.int = 1; old.abilities.asi.dex = 1;
  const s = E.normalize(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(s.feats, [{ id: E.ASI_ID, picks: ["dex", "int"] }]);
  assert.equal(E.abilityScores(r, s).int.total, 17);
  assert.equal(E.abilityScores(r, s).dex.total, 15);
});

personalTest("every generated link points to an existing compendium note", () => {
  const vault = VAULT;
  const data = personal;
  const missing: string[] = [];
  const check = (l: string | null) => { if (!l) return; const p = path.join(vault, l.split("#")[0] + ".md"); if (!fs.existsSync(p)) missing.push(l); };
  for (const k of ["races", "classes", "backgrounds", "feats", "spells", "items"]) for (const x of data[k]) check(x.link);
  for (const c of data.classes) { c.features.forEach((f: any) => check(f.link)); c.subclasses.forEach((sc: any) => { check(sc.link); sc.features.forEach((f: any) => check(f.link)); }); }
  assert.deepEqual(missing.slice(0, 5), []);
});

test("legacy Biography/Notes sections move into the sheet and leave other content alone", () => {
  const note = "---\ndnd: {}\n---\n\n```dnd-character\n```\n\n## Biography\n\nBorn in a swamp.\nLikes frogs.\n\n## Notes\n\nSession 1: met Marie.\n\n## Loot\n\n- 5 gp\n";
  const r = E.extractLegacySections(note)!;
  assert.equal(r.biography, "Born in a swamp.\nLikes frogs.");
  assert.equal(r.diary, "Session 1: met Marie.");
  assert.equal(r.text, "---\ndnd: {}\n---\n\n```dnd-character\n```\n\n## Loot\n\n- 5 gp\n");
  assert.equal(E.extractLegacySections("---\na: 1\n---\n\n```dnd-character\n```\n"), null);
  const empty = E.extractLegacySections("---\na: 1\n---\n\n```dnd-character\n```\n\n## Biography\n\n\n## Notes\n\n")!;
  assert.deepEqual([empty.biography, empty.diary, empty.text], ["", "", "---\na: 1\n---\n\n```dnd-character\n```\n"]);
});
