import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";

const spell = (name: string, source: string, id = `${name}|${source}`.toLowerCase()): any => ({ id, name, source, level: 1, classes: [] });
const data: any = {
  meta: { sources: {} }, races: [], backgrounds: [], feats: [{ id: "alert|phb", name: "Alert", source: "PHB" }], items: [{ id: "rope|phb", name: "Rope" }, { id: "rope|phb", name: "Rope (later copy)" }],
  spells: [spell("Bless", "PHB"), spell("Bless", "XPHB"), spell("Cure Wounds", "PHB")],
  classes: [{ id: "cleric|phb", name: "Cleric", features: [], subclasses: [{ id: "cleric|life|phb", name: "Life Domain", shortName: "Life", features: [], additionalSpells: [{ prepared: { 1: ["bless|xphb", "cure wounds", "bless|dmg"], 3: ["missing spell"] } }] }] }],
};
const r = new E.Rules(data);

test("lookups by id: the first entry with that id, null when there is none", () => {
  assert.equal(r.spell("bless|xphb")?.source, "XPHB");
  assert.equal(r.item("rope|phb")?.name, "Rope");
  assert.equal(r.item(null), null);
  assert.equal(r.item("nothing"), null);
  assert.equal(r.feat("alert|phb")?.name, "Alert");
  assert.equal(r.cls("cleric|phb")?.name, "Cleric");
  assert.equal(r.subclass({ id: "cleric|phb", subclass: "cleric|life|phb", level: 1, hpRolls: [], skills: [] })?.shortName, "Life");
});

test("granted spells are found by name and source, else by name (case-insensitive)", () => {
  const s = E.newCharacter();
  s.classes = [{ id: "cleric|phb", subclass: "cleric|life|phb", level: 1, hpRolls: [], skills: [] }];
  // "bless|dmg": no Bless from DMG, so the first Bless; the duplicate is listed once
  assert.deepEqual(E.grantedSpells(r, s), [{ id: "bless|xphb", why: "Life" }, { id: "cure wounds|phb", why: "Life" }, { id: "bless|phb", why: "Life" }]);
});
