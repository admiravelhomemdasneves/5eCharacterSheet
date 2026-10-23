import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";

// A homebrew class named nothing like the PHB ones, with the PHB's rule features, and two feats
const feature = (name: string, level: number, text: string): any => ({ name, level, source: "HB", text, link: null });
const hbClass: any = {
  id: "warden|hb", name: "Warden", source: "HB", hd: 10, saves: ["con", "wis"], armor: [], weapons: [], tools: [], skills: [], spellcasting: null, pactSlots: null,
  tableCols: [{ label: "Unarmored Movement", rows: [null, "+10 ft.", "+10 ft.", "+10 ft.", "+10 ft.", "+15 ft."] }],
  subclassTitle: "Path", subclassLevel: 3, multiclass: null,
  features: [
    feature("Unarmored Defense", 1, "While you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier."),
    feature("Jack of All Trades", 2, "You can add half your proficiency bonus, rounded down, to any ability check you make that doesn't already include your proficiency bonus."),
    feature("Fast Movement", 5, "Your speed increases by 15 feet while you aren't wearing heavy armor."),
  ],
  subclasses: [{ id: "warden|scaled|hb", name: "Path of Scales", shortName: "Scaled", source: "HB", link: null, spellcasting: null, additionalSpells: null,
    features: [feature("Draconic Resilience", 3, "Your hit point maximum increases by 1 and increases by 1 again whenever you gain a level in this class. Additionally, while you aren't wearing armor, your AC equals 13 + your Dexterity modifier.")] }],
};
const data: any = {
  meta: { sources: {} }, races: [], backgrounds: [], spells: [], classes: [hbClass],
  feats: [{ id: "alert|hb", name: "Alert", source: "HB", prereq: "", ability: [], text: "You gain a +3 bonus to initiative." }, { id: "tough|hb", name: "Tough", source: "HB", prereq: "", ability: [], text: "" }],
  items: [{ id: "shield|phb", name: "Shield", kind: "armor", armorType: "shield", ac: 2, bonusAc: 0 }],
};
const r = new E.Rules(data);
const warden = (level: number, subclass: string | null = null) => {
  const s = E.newCharacter("W");
  s.abilities.method = "manual";
  s.abilities.base = { str: 10, dex: 14, con: 12, int: 10, wis: 16, cha: 8 };
  s.classes = [{ id: "warden|hb", subclass, level, hpRolls: [], skills: [] }];
  return s;
};

test("a homebrew class gets the rules of its features: Unarmored Defense, Jack of All Trades", () => {
  assert.deepEqual([E.armorClass(r, warden(1)).value, E.armorClass(r, warden(1)).how], [15, "Unarmored Defense (10 + DEX + WIS)"]);
  const shielded = warden(1);
  shielded.inventory = [{ id: "shield|phb", name: "Shield", qty: 1, weight: 6, equipped: true, attuned: false, notes: "" }];
  assert.equal(E.armorClass(r, shielded).value, 14); // "not wielding a shield": 10 + DEX + shield
  assert.equal(E.skillBonus(r, warden(1), "arcana"), 0);
  assert.equal(E.skillBonus(r, warden(2), "arcana"), 1); // half of +2
});

test("speed from the class table's Unarmored Movement and from Fast Movement's text", () => {
  assert.equal(E.speeds(r, warden(1)).walk, 30);
  assert.equal(E.speeds(r, warden(2)).walk, 40);
  assert.equal(E.speeds(r, warden(5)).walk, 55); // +10 table, +15 Fast Movement
});

test("hit points and armour class from a Draconic Resilience subclass feature", () => {
  const s = warden(4, "warden|scaled|hb");
  assert.equal(E.hpBreakdown(r, s).draconic, 4);
  // with WIS 10, Draconic Resilience (13 + DEX = 15) beats Unarmored Defense (10 + DEX + WIS = 12)
  s.abilities.base.wis = 10;
  assert.deepEqual([E.armorClass(r, s).value, E.armorClass(r, s).how], [15, "Draconic Resilience (13 + DEX)"]);
  assert.equal(E.hpBreakdown(r, warden(4)).draconic, 0);
});

test("feats by name: Tough, and Alert with the bonus its text gives", () => {
  const s = warden(3);
  assert.equal(E.initiative(r, s), 2);
  s.feats = [{ id: "alert|hb", picks: [] }, { id: "tough|hb", picks: [] }];
  assert.equal(E.initiative(r, s), 5);
  assert.equal(E.hpBreakdown(r, s).tough, 6);
});
