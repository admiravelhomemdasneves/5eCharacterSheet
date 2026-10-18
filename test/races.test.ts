import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/rules/engine.ts";
import { buildCompendium, IMPORT_VERSION, importOutdated, STANDARD_SUBRACE } from "../src/data/build.ts";

// A minimal 5etools data folder: just enough races to check how racial ability bonuses are read.
// As in 5etools, the standard Human's +1 to every ability is on an unnamed subrace, not on the race.
const ALL = ["str", "dex", "con", "int", "wis", "cha"];
const RACES = {
  race: [
    { name: "Human", source: "PHB", srd: true, size: ["M"], speed: 30 },
    { name: "Dwarf", source: "PHB", srd: true, size: ["M"], speed: 25, ability: [{ con: 2 }] },
    { name: "Half-Orc", source: "PHB", srd: true, size: ["M"], speed: 30, ability: [{ str: 2, con: 1 }] },
  ],
  subrace: [
    { source: "PHB", raceName: "Human", raceSource: "PHB", srd: true, ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }] },
    { name: "Variant", source: "PHB", raceName: "Human", raceSource: "PHB", ability: [{ choose: { from: ALL, count: 2 } }] },
    { name: "Hill", source: "PHB", raceName: "Dwarf", raceSource: "PHB", srd: true, ability: [{ wis: 1 }] },
    // most races' unnamed subrace is an empty placeholder: their bonuses are on the race
    { source: "PHB", raceName: "Half-Orc", raceSource: "PHB", srd: true },
  ],
};
const FILES: Record<string, unknown> = {
  "races.json": RACES, "class/index.json": {}, "backgrounds.json": { background: [] }, "feats.json": { feat: [] },
  "spells/sources.json": {}, "spells/index.json": {}, "items-base.json": { baseitem: [] }, "items.json": { item: [] },
  "books.json": { book: [] }, "adventures.json": { adventure: [] },
};
const data = await buildCompendium({ read: async (p) => structuredClone(FILES[p]) });
const r = new E.Rules(data);

const character = (race: string, subrace: string | null) => {
  const s = E.newCharacter("Test");
  const rc = data.races.find((x) => x.name === race)!;
  s.race = rc.id;
  s.subrace = subrace ? rc.subraces.find((x) => x.name === subrace)!.id : null;
  s.abilities.method = "manual";
  s.abilities.base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  return s;
};

test("the unnamed subrace is kept as a required Standard subrace", () => {
  const human = data.races.find((x) => x.name === "Human")!;
  assert.deepEqual(human.subraces.map((x) => x.name).sort(), ["Standard", "Variant"]);
  assert.equal(STANDARD_SUBRACE, "Standard");
  assert.equal(human.subraceRequired, true);
  assert.ok(E.pendingChoices(r, character("Human", null)).some((p) => /Choose a Human subrace/.test(p)));
  // a race with only named subraces keeps working as before
  assert.equal(data.races.find((x) => x.name === "Dwarf")!.subraces.length, 1);
});

test("standard Human: +1 to every ability", () => {
  const sc = E.abilityScores(r, character("Human", "Standard"));
  for (const a of E.ABILITIES) assert.equal(sc[a].total, 11, a);
});

test("Variant Human: the two +1 of your choice are offered and applied", () => {
  const s = character("Human", "Variant");
  const [opt] = E.raceAbilityOptions(r, s);
  assert.deepEqual(opt.choose.map((c) => c.count), [2]);
  assert.ok(E.pendingChoices(r, s).some((p) => /Pick 2 racial ability/.test(p)));
  s.raceAbility.picks = ["str", "con"];
  const sc = E.abilityScores(r, s);
  assert.equal(sc.str.total, 11);
  assert.equal(sc.con.total, 11);
  assert.equal(sc.dex.total, 10);
  assert.ok(!E.pendingChoices(r, s).some((p) => /racial ability/.test(p)));
});

test("Hill Dwarf: race and subrace bonuses add up, as before", () => {
  const sc = E.abilityScores(r, character("Dwarf", "Hill"));
  assert.equal(sc.con.total, 12);
  assert.equal(sc.wis.total, 11);
});

test("subrace choices come after the race's, so saved picks keep their place", () => {
  const s = character("Dwarf", "Hill");
  const dwarf = data.races.find((x) => x.name === "Dwarf")!;
  // a subrace that adds a choice on top of a race that has one
  dwarf.ability = [{ label: "", fixed: {}, choose: [{ from: ["str", "dex"], count: 1, amount: 1 }] }];
  dwarf.subraces[0].ability = [{ label: "", fixed: { wis: 1 }, choose: [{ from: ["int", "cha"], count: 1, amount: 1 }] }];
  s.raceAbility.picks = ["dex", "cha"];
  const sc = E.abilityScores(r, s);
  assert.equal(sc.dex.total, 11);
  assert.equal(sc.cha.total, 11);
  assert.equal(sc.wis.total, 11);
});

test("an empty unnamed subrace is skipped: no pointless Standard choice", () => {
  const halfOrc = data.races.find((x) => x.name === "Half-Orc")!;
  assert.equal(halfOrc.subraces.length, 0);
  assert.equal(halfOrc.subraceRequired, false);
  assert.equal(E.abilityScores(r, character("Half-Orc", null)).str.total, 12);
});

test("SRD build: a lone Standard subrace is merged into the race", async () => {
  const srd = await buildCompendium({ read: async (p) => structuredClone(FILES[p]), srdOnly: true });
  const human = srd.races.find((x) => x.name === "Human")!;
  assert.equal(human.subraces.length, 0);
  assert.equal(human.subraceRequired, false);
  const s = E.newCharacter("Srd");
  s.race = human.id;
  s.abilities.method = "manual";
  s.abilities.base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const sc = E.abilityScores(new E.Rules(srd), s);
  for (const a of E.ABILITIES) assert.equal(sc[a].total, 11, a);
});

test("imported data is stamped; data from before the stamp asks for a new import", () => {
  assert.equal(data.meta.importVersion, IMPORT_VERSION);
  assert.equal(importOutdated(data.meta), false);
  // data imported by 1.0.x has no stamp
  assert.equal(importOutdated({}), true);
  assert.equal(importOutdated({ importVersion: IMPORT_VERSION - 1 }), true);
});
