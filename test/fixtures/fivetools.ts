// A small 5etools data folder with both editions in it, shaped like the real files (names and fields
// from 5etools, text made up). It stands in for vendor/5etools-data, which is not in the repository.
const spell = (name: string, source: string, level: number, extra: object = {}) => ({ name, source, level, school: "V", time: [{ number: 1, unit: "action" }], range: { type: "point", distance: { type: "feet", amount: 60 } }, components: { v: true }, duration: [{ type: "instant" }], entries: ["Text."], ...extra });

export const FILES: Record<string, unknown> = {
  "races.json": {
    race: [
      { name: "Dwarf", source: "PHB", srd: true, size: ["M"], speed: 25, ability: [{ con: 2 }], darkvision: 60, reprintedAs: ["Dwarf|XPHB"], entries: [{ type: "entries", name: "Stonecunning", entries: ["Text."] }] },
      { name: "Dwarf", source: "XPHB", srd52: true, edition: "one", size: ["M"], speed: 30, darkvision: 120, entries: [{ type: "entries", name: "Dwarven Toughness", entries: ["Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level."] }] },
    ],
    subrace: [
      { name: "Hill", source: "PHB", srd: true, raceName: "Dwarf", raceSource: "PHB", ability: [{ wis: 1 }], entries: [{ type: "entries", name: "Dwarven Toughness", entries: ["Your hit point maximum increases by 1, and it increases by 1 every time you gain a level."] }] },
    ],
  },
  "class/index.json": { fighter: "class-fighter.json" },
  "class/class-fighter.json": {
    class: [
      {
        name: "Fighter", source: "PHB", srd: true, hd: { faces: 10 }, proficiency: ["str", "con"], subclassTitle: "Martial Archetype", reprintedAs: ["Fighter|XPHB"],
        startingProficiencies: { armor: ["light", "medium", "heavy", "shield"], weapons: ["simple", "martial"], skills: [{ choose: { from: ["athletics", "history"], count: 2 } }] },
        classFeatures: ["Second Wind|Fighter||1", { classFeature: "Martial Archetype|Fighter||3", gainSubclassFeature: true }],
      },
      {
        name: "Fighter", source: "XPHB", srd52: true, edition: "one", hd: { faces: 10 }, proficiency: ["str", "con"], subclassTitle: "Fighter Subclass",
        startingProficiencies: { armor: ["light", "medium", "heavy", "shield"], weapons: ["simple", "martial"], skills: [{ choose: { from: ["athletics", "history"], count: 2 } }] },
        classFeatures: ["Second Wind|Fighter|XPHB|1", "Weapon Mastery|Fighter|XPHB|1", { classFeature: "Fighter Subclass|Fighter|XPHB|3", gainSubclassFeature: true }],
      },
    ],
    classFeature: [
      { name: "Second Wind", source: "PHB", srd: true, className: "Fighter", classSource: "PHB", level: 1, entries: ["Text."] },
      { name: "Martial Archetype", source: "PHB", srd: true, className: "Fighter", classSource: "PHB", level: 3, entries: ["Text."] },
      { name: "Second Wind", source: "XPHB", srd52: true, className: "Fighter", classSource: "XPHB", level: 1, entries: ["Text."] },
      { name: "Weapon Mastery", source: "XPHB", srd52: true, className: "Fighter", classSource: "XPHB", level: 1, entries: ["Text."] },
      { name: "Fighter Subclass", source: "XPHB", srd52: true, className: "Fighter", classSource: "XPHB", level: 3, entries: ["Text."] },
    ],
    subclass: [
      { name: "Champion", shortName: "Champion", source: "PHB", srd: true, className: "Fighter", classSource: "PHB", subclassFeatures: ["Champion|Fighter||Champion||3"] },
      { name: "Champion", shortName: "Champion", source: "XPHB", srd52: true, edition: "one", className: "Fighter", classSource: "XPHB", subclassFeatures: ["Champion|Fighter|XPHB|Champion|XPHB|3"] },
      // an older subclass made to work with the 2024 class, which keeps its own source
      { name: "Samurai", shortName: "Samurai", source: "XGE", className: "Fighter", classSource: "PHB", subclassFeatures: ["Samurai|Fighter||Samurai|XGE|3"] },
      { name: "Samurai", shortName: "Samurai", source: "XGE", className: "Fighter", classSource: "XPHB", subclassFeatures: ["Samurai|Fighter|XPHB|Samurai|XGE|3"] },
    ],
    subclassFeature: [
      { name: "Champion", source: "PHB", srd: true, className: "Fighter", classSource: "PHB", subclassShortName: "Champion", subclassSource: "PHB", level: 3, entries: ["Text."] },
      { name: "Champion", source: "XPHB", srd52: true, className: "Fighter", classSource: "XPHB", subclassShortName: "Champion", subclassSource: "XPHB", level: 3, entries: ["Text."] },
      { name: "Samurai", source: "XGE", className: "Fighter", classSource: "PHB", subclassShortName: "Samurai", subclassSource: "XGE", level: 3, entries: ["Text."] },
    ],
  },
  "backgrounds.json": {
    background: [
      { name: "Acolyte", source: "PHB", srd: true, reprintedAs: ["Acolyte|XPHB"], skillProficiencies: [{ insight: true, religion: true }], entries: [{ type: "entries", name: "Feature: Shelter of the Faithful", entries: ["Text."] }] },
      { name: "Acolyte", source: "XPHB", srd52: true, edition: "one", ability: [{ choose: { weighted: { from: ["int", "wis", "cha"], weights: [2, 1] } } }, { choose: { weighted: { from: ["int", "wis", "cha"], weights: [1, 1, 1] } } }], feats: [{ "magic initiate; cleric|xphb": true }], skillProficiencies: [{ insight: true, religion: true }], entries: [{ type: "list", items: ["Text."] }] },
    ],
  },
  "feats.json": {
    feat: [
      { name: "Grappler", source: "PHB", srd: true, reprintedAs: ["Grappler|XPHB"], entries: ["Text."] },
      { name: "Grappler", source: "XPHB", srd52: true, category: "G", entries: ["Text."] },
      { name: "Alert", source: "PHB", reprintedAs: ["Alert|XPHB"], entries: ["Text."] },
      { name: "Alert", source: "XPHB", srd52: true, category: "O", entries: ["Text."] },
    ],
  },
  "spells/sources.json": {
    PHB: { Fireball: { class: [{ name: "Wizard", source: "PHB" }] } },
    XPHB: { Fireball: { class: [{ name: "Wizard", source: "XPHB" }] } },
    XGE: { "Toll the Dead": { class: [{ name: "Wizard", source: "PHB" }, { name: "Wizard", source: "XPHB" }] } },
  },
  "spells/index.json": { PHB: "spells-phb.json", XPHB: "spells-xphb.json", XGE: "spells-xge.json" },
  "spells/spells-phb.json": { spell: [spell("Fireball", "PHB", 3, { srd: true, reprintedAs: ["Fireball|XPHB"] })] },
  "spells/spells-xphb.json": { spell: [spell("Fireball", "XPHB", 3, { srd52: true })] },
  "spells/spells-xge.json": { spell: [spell("Toll the Dead", "XGE", 0)] },
  "items-base.json": {
    baseitem: [
      { name: "Longsword", source: "PHB", srd: true, reprintedAs: ["Longsword|XPHB"], type: "M", rarity: "none", weight: 3, value: 1500, weaponCategory: "martial", property: ["V"], dmg1: "1d8", dmgType: "S", dmg2: "1d10", weapon: true },
      { name: "Longsword", source: "XPHB", srd52: true, edition: "one", type: "M|XPHB", rarity: "none", weight: 3, value: 1500, weaponCategory: "martial", property: ["V|XPHB"], mastery: ["Sap|XPHB"], dmg1: "1d8", dmgType: "S", dmg2: "1d10", weapon: true },
    ],
    itemMastery: [{ name: "Sap", source: "XPHB", srd52: true, entries: ["Text."] }],
  },
  "items.json": { item: [] },
  "optionalfeatures.json": { optionalfeature: [] },
  "books.json": { book: [{ id: "PHB", name: "Player's Handbook (2014)" }, { id: "XPHB", name: "Player's Handbook (2024)" }, { id: "XGE", name: "Xanathar's Guide to Everything" }] },
  "adventures.json": { adventure: [] },
};
export const read = async (p: string) => structuredClone(FILES[p]);
