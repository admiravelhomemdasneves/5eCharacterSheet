// The custom entries of the 2014 rules: the kinds a player can make, their fields, and how each becomes
// rules data (the types of src/rules/engine.ts) or fills the free text of manual mode.
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability, type AbilityOption, type BackgroundData, type Compendium, type FeatData, type ItemData, type ProfList, type RaceData, type Speeds, type SpellData, type SubraceData } from "../engine.ts";
import { CUSTOM_SOURCE, type CustomEntry } from "../../custom/format.ts";
import { bool, commaList, num, rows, str, strs, type Choice, type CustomContext, type FieldDef, type KindDef, type Ruleset } from "../../custom/schema.ts";
import { title } from "../../text.ts";

const ORDINAL = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const WEAPON_PROPERTIES = ["ammunition", "finesse", "heavy", "light", "loading", "reach", "special", "thrown", "two-handed", "versatile"];
const RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact"];
const plain = (list: string[], label = title): Choice[] => list.map((x) => ({ value: x, label: label(x) }));
const abilityChoices: Choice[] = ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a] }));
const skillChoices = plain(Object.keys(SKILLS));
const isAbility = (x: string): x is Ability => (ABILITIES as string[]).includes(x);
const absent = (v: string) => v || null;

/** Ability score increases: fixed ones and choices, as one AbilityOption (none: no option). */
const abilityFields: FieldDef[] = [
  { key: "abilityFixed", label: "Ability score increases", help: "Increases the entry always gives.", type: "list", addLabel: "+ Add an increase", of: [
    { key: "ability", label: "Ability", type: "select", options: abilityChoices },
    { key: "amount", label: "Amount", type: "number", min: 1, max: 4 },
  ] },
  { key: "abilityChoose", label: "Ability score choices", help: "Increases the player picks: how many abilities, from which, and by how much.", type: "list", addLabel: "+ Add a choice", of: [
    { key: "from", label: "From", type: "multiselect", options: abilityChoices },
    { key: "count", label: "How many", type: "number", min: 1, max: 6 },
    { key: "amount", label: "Amount", type: "number", min: 1, max: 4 },
  ] },
];
function abilityOptions(d: Record<string, unknown>): AbilityOption[] {
  const fixed: AbilityOption["fixed"] = {};
  for (const r of rows(d, "abilityFixed")) { const a = str(r, "ability"); if (isAbility(a)) fixed[a] = (fixed[a] || 0) + (num(r, "amount") || 1); }
  const choose = rows(d, "abilityChoose").map((r) => ({ from: strs(r, "from").filter(isAbility), count: Math.max(1, num(r, "count")), amount: Math.max(1, num(r, "amount")) })).filter((c) => c.from.length);
  return Object.keys(fixed).length || choose.length ? [{ label: "", fixed, choose }] : [];
}
/** An entry's id is new to `list` (a custom entry can't take the place of another). */
const clash = (list: { id: string }[], e: CustomEntry) => (list.some((x) => x.id === e.id) ? "another entry has the same id" : null);

const background: KindDef = {
  kind: "background", label: ["Background", "Backgrounds"], noteKind: "backgrounds",
  fields: [
    { key: "skills", label: "Skill proficiencies", type: "multiselect", options: skillChoices },
    { key: "skillChoices", label: "Skills to choose", help: "How many more skills of the player's choice.", type: "number", min: 0, max: 6 },
    { key: "tools", label: "Tool proficiencies", help: "Separated by commas.", type: "text", placeholder: "Thieves' tools, one gaming set" },
    { key: "languages", label: "Languages", help: "Separated by commas.", type: "text", placeholder: "Elvish, one of your choice" },
    { key: "featureName", label: "Feature", type: "text", placeholder: "Feature name" },
    { key: "featureText", label: "Feature text", type: "markdown", visible: (d) => !!str(d, "featureName") },
  ],
  apply: (e, data) => {
    const d = e.data, problem = clash(data.backgrounds, e);
    if (problem) return problem;
    const more = num(d, "skillChoices");
    const out: BackgroundData = {
      id: e.id, name: e.name, source: CUSTOM_SOURCE, link: null,
      skills: { fixed: strs(d, "skills").filter((k) => k in SKILLS), choose: more > 0 ? [{ from: "any", count: more }] : [] },
      tools: { fixed: commaList(str(d, "tools")), choose: [] }, languages: commaList(str(d, "languages")),
      feature: str(d, "featureName") ? { name: str(d, "featureName"), text: str(d, "featureText"), link: null } : null, feats: null,
    };
    data.backgrounds.push(out);
    return null;
  },
  summary: (e) => strs(e.data, "skills").map(title).join(", "),
  manual: { section: "background", label: "background", fill: (e, s) => {
    s.manual.background = e.name;
    const f = str(e.data, "featureName");
    if (f && !s.manual.raceFeatures.includes(f)) s.manual.raceFeatures.push(f);
  } },
};

const feat: KindDef = {
  kind: "feat", label: ["Feat", "Feats"], noteKind: "feats",
  fields: [
    { key: "prereq", label: "Prerequisite", type: "text", placeholder: "Dexterity 13 or higher" },
    ...abilityFields,
    { key: "text", label: "Text", type: "markdown", required: true },
  ],
  apply: (e, data) => {
    const problem = clash(data.feats, e);
    if (problem) return problem;
    const out: FeatData = { id: e.id, name: e.name, source: CUSTOM_SOURCE, link: null, prereq: str(e.data, "prereq"), ability: abilityOptions(e.data), text: str(e.data, "text"), spells: null };
    data.feats.push(out);
    return null;
  },
  summary: (e) => (str(e.data, "prereq") ? `Prerequisite: ${str(e.data, "prereq")}` : ""),
  manual: { section: "feats", label: "feat", fill: (e, s) => { s.manual.feats.push(e.name); } },
};

const spell: KindDef = {
  kind: "spell", label: ["Spell", "Spells"], noteKind: "spells",
  fields: [
    { key: "level", label: "Level", type: "select", required: true, options: ORDINAL.map((o, i) => ({ value: String(i), label: o })) },
    { key: "school", label: "School", type: "select", required: true, options: plain(SCHOOLS, (x) => x) },
    { key: "time", label: "Casting time", type: "text", placeholder: "1 action" },
    { key: "range", label: "Range", type: "text", placeholder: "60 feet" },
    { key: "components", label: "Components", type: "text", placeholder: "V, S, M (a pinch of salt)" },
    { key: "duration", label: "Duration", type: "text", placeholder: "Instantaneous" },
    { key: "concentration", label: "Concentration", type: "checkbox" },
    { key: "ritual", label: "Ritual", type: "checkbox" },
    { key: "classes", label: "Spell lists", help: "The classes that can learn it.", type: "multiselect", options: (ctx) => [...new Set(ctx.data.classes.map((c) => c.name))].sort().map((n) => ({ value: n, label: n })) },
    { key: "text", label: "Text", type: "markdown", required: true },
  ],
  apply: (e, data) => {
    const d = e.data, problem = clash(data.spells, e);
    if (problem) return problem;
    const out: SpellData = {
      id: e.id, name: e.name, source: CUSTOM_SOURCE, link: null, level: Math.max(0, Math.min(9, num(d, "level"))), school: str(d, "school"),
      time: str(d, "time"), range: str(d, "range"), components: str(d, "components"), duration: str(d, "duration"),
      concentration: bool(d, "concentration"), ritual: bool(d, "ritual"), classes: strs(d, "classes"), text: str(d, "text"),
    };
    data.spells.push(out);
    return null;
  },
  summary: (e) => `${num(e.data, "level") ? `${ORDINAL[num(e.data, "level")]}-level` : "Cantrip"} ${str(e.data, "school").toLowerCase()}`.trim(),
  manual: { section: "spells", label: "spell", fill: (e, s) => { s.manual.spells.push({ name: e.name, level: Math.max(0, Math.min(9, num(e.data, "level"))), prepared: false }); } },
};

const isArmor = (d: Record<string, unknown>) => str(d, "type") === "armor", isWeapon = (d: Record<string, unknown>) => str(d, "type") === "weapon";
const item: KindDef = {
  kind: "item", label: ["Item", "Items"], noteKind: "items",
  fields: [
    { key: "type", label: "Type", type: "select", required: true, options: [{ value: "gear", label: "Gear" }, { value: "weapon", label: "Weapon" }, { value: "armor", label: "Armour or shield" }] },
    { key: "armorType", label: "Armour type", type: "select", visible: isArmor, options: plain(["light", "medium", "heavy", "shield"]) },
    { key: "ac", label: "Armour class", help: "For a shield, the bonus it gives.", type: "number", min: 0, max: 30, visible: isArmor },
    { key: "strength", label: "Strength required", type: "number", min: 0, max: 30, visible: isArmor },
    { key: "stealth", label: "Disadvantage on Stealth", type: "checkbox", visible: isArmor },
    { key: "weaponCategory", label: "Category", type: "select", visible: isWeapon, options: plain(["simple", "martial"]) },
    { key: "ranged", label: "Ranged weapon", type: "checkbox", visible: isWeapon },
    { key: "dmg1", label: "Damage", type: "text", placeholder: "1d8", visible: isWeapon },
    { key: "dmg2", label: "Two-handed damage", type: "text", placeholder: "1d10 (versatile)", visible: isWeapon },
    { key: "dmgType", label: "Damage type", type: "select", visible: isWeapon, options: plain(DAMAGE_TYPES) },
    { key: "properties", label: "Properties", type: "multiselect", visible: isWeapon, options: plain(WEAPON_PROPERTIES) },
    { key: "range", label: "Range", type: "text", placeholder: "80/320", visible: isWeapon },
    { key: "weight", label: "Weight (lb.)", type: "number", min: 0, step: 0.25 },
    { key: "value", label: "Value (gp)", type: "number", min: 0, step: 0.01 },
    { key: "magic", label: "Magic item", type: "checkbox" },
    { key: "rarity", label: "Rarity", type: "select", visible: (d) => bool(d, "magic"), options: plain(RARITIES) },
    { key: "attunement", label: "Requires attunement", type: "checkbox", visible: (d) => bool(d, "magic") },
    { key: "bonusAc", label: "Bonus to AC", type: "number", min: 0, max: 5, visible: (d) => bool(d, "magic") && isArmor(d) },
    { key: "bonusWeapon", label: "Bonus to attack and damage", type: "number", min: 0, max: 5, visible: (d) => bool(d, "magic") && isWeapon(d) },
  ],
  apply: (e, data) => {
    const d = e.data, problem = clash(data.items, e);
    if (problem) return problem;
    const kind = str(d, "type") === "armor" ? "armor" : str(d, "type") === "weapon" ? "weapon" : "gear";
    const armor = kind === "armor", weapon = kind === "weapon", magic = bool(d, "magic");
    const out: ItemData = {
      id: e.id, name: e.name, source: CUSTOM_SOURCE, link: null, kind,
      armorType: armor ? absent(str(d, "armorType")) ?? "light" : null, ac: armor ? num(d, "ac") || null : null, strength: armor ? num(d, "strength") || null : null, stealth: armor && bool(d, "stealth"),
      weaponCategory: weapon ? absent(str(d, "weaponCategory")) : null, ranged: weapon && bool(d, "ranged"),
      dmg1: weapon ? absent(str(d, "dmg1")) : null, dmg2: weapon ? absent(str(d, "dmg2")) : null, dmgType: weapon ? absent(str(d, "dmgType")) : null,
      properties: weapon ? strs(d, "properties") : [], range: weapon ? absent(str(d, "range")) : null,
      // the data keeps values in copper pieces
      weight: num(d, "weight") || null, value: num(d, "value") ? Math.round(num(d, "value") * 100) : null,
      magic, rarity: magic ? absent(str(d, "rarity")) : null, attunement: magic && bool(d, "attunement"),
      bonusAc: magic && armor ? num(d, "bonusAc") : 0, bonusWeapon: magic && weapon ? num(d, "bonusWeapon") : 0, baseItem: null,
    };
    data.items.push(out);
    return null;
  },
  summary: (e) => [title(str(e.data, "type") || "gear"), bool(e.data, "magic") ? str(e.data, "rarity") || "magic" : ""].filter(Boolean).join(", "),
  manual: { section: "inventory", label: "item", fill: (e, s) => {
    s.inventory.push({ id: null, name: e.name, qty: 1, weight: num(e.data, "weight") || null, equipped: false, attuned: false, notes: "" });
  } },
};

// ---------------------------------------------------------------- races, subraces and their traits
const SIZES = ["Tiny", "Small", "Medium", "Large"];
const SPEEDS: [key: string, label: string][] = [["walk", "Speed (feet)"], ["fly", "Flying speed"], ["swim", "Swimming speed"], ["climb", "Climbing speed"]];
const raceSpeedFields: FieldDef[] = SPEEDS.map(([key, label]) => (key === "walk"
  ? { key, label, type: "number", min: 0, step: 5, default: 30, required: true }
  : { key, label, help: "0: none.", type: "number", min: 0, step: 5 }));
/** The race a subrace's data names, in the data the form is for. */
const raceOfSub = (d: Record<string, unknown>, ctx: CustomContext) => ctx.data.races.find((r) => r.id === str(d, "race"));
/** What a subrace's speed or darkvision is when left empty: its race's ("30 ft.", "none"), null while no race is chosen. */
function raceValue(d: Record<string, unknown>, ctx: CustomContext, key: string) {
  const race = raceOfSub(d, ctx);
  if (!race) return null;
  const v = key === "darkvision" ? race.darkvision : typeof race.speed[key] === "string" ? race.speed.walk : race.speed[key];
  return typeof v === "number" && v > 0 ? `${v} ft.` : "none";
}
/** A subrace's speeds and darkvision: empty, the race's (shown as the placeholder and in the help); a value replaces it. */
const subraceSenseFields: FieldDef[] = [...SPEEDS, ["darkvision", "Darkvision (feet)"] as [string, string]].map(([key, label]): FieldDef => ({
  key, label, type: "number", min: 0, step: key === "darkvision" ? 30 : 5, default: null,
  help: (d, ctx) => { const v = raceValue(d, ctx, key); return v ? `If left empty: ${v} from race ${raceOfSub(d, ctx)!.name}.` : "If left empty: the race's, once one is chosen."; },
  placeholder: (d, ctx) => raceValue(d, ctx, key)?.replace(" ft.", "") ?? "",
}));
/** The speeds an entry gives (a race always has a walking speed; a subrace only those it changes). */
function speedsOf(d: Record<string, unknown>, walk: boolean): Speeds {
  const out: Speeds = walk ? { walk: num(d, "walk") || 30 } : {};
  for (const [k] of SPEEDS) if (k !== "walk" || !walk) { if (num(d, k) > 0) out[k] = num(d, k); }
  return out;
}
const skillFields: FieldDef[] = [
  { key: "skills", label: "Skill proficiencies", type: "multiselect", options: skillChoices },
  { key: "skillChoices", label: "Skills to choose", help: "How many more skills the player picks.", type: "number", min: 0, max: 6 },
  { key: "skillChoiceFrom", label: "Skills to choose from", help: "None picked: any skill.", type: "multiselect", options: skillChoices, visible: (d) => num(d, "skillChoices") > 0 },
];
const skillsOf = (d: Record<string, unknown>): ProfList => {
  const from = strs(d, "skillChoiceFrom").filter((k) => k in SKILLS), more = num(d, "skillChoices");
  return { fixed: strs(d, "skills").filter((k) => k in SKILLS), choose: more > 0 ? [{ from: from.length ? from : "any", count: more }] : [] };
};
const traitsField: FieldDef = { key: "traits", label: "Traits", help: "Shown in Race & Background Features.", type: "list", addLabel: "+ Add a trait", of: [
  { key: "name", label: "Name", type: "text" }, { key: "text", label: "Text", type: "markdown" },
] };
const traitsOf = (d: Record<string, unknown>) => rows(d, "traits").filter((r) => str(r, "name")).map((r) => ({ name: str(r, "name"), text: str(r, "text") }));
const fixedList = (d: Record<string, unknown>, k: string): ProfList => ({ fixed: commaList(str(d, k)), choose: [] });
/** Replace race `id` in the data with `change` of a copy, so the data it was copied from keeps its own (see mergeCustom). False: no such race. */
function changeRace(data: Compendium, id: string, change: (r: RaceData) => void) {
  const i = data.races.findIndex((r) => r.id === id);
  if (i < 0) return false;
  const copy = { ...data.races[i], traits: [...data.races[i].traits], subraces: [...data.races[i].subraces] };
  change(copy);
  data.races[i] = copy;
  return true;
}
const raceChoices = (ctx: CustomContext): Choice[] => ctx.data.races.map((r) => ({ value: r.id, label: r.source === CUSTOM_SOURCE ? r.name : `${r.name} (${r.source})` }));
/** A race-feature's parent: "raceId" or "raceId>subraceId" */
const SUB = ">";
/** The races and subraces of the rules data (not custom ones: their traits are in their own forms). */
const dataRaceChoices = (ctx: CustomContext): Choice[] => ctx.data.races.filter((r) => r.source !== CUSTOM_SOURCE).flatMap((r) => [
  { value: r.id, label: `${r.name} (${r.source})` },
  ...r.subraces.filter((s) => s.source !== CUSTOM_SOURCE).map((s) => ({ value: `${r.id}${SUB}${s.id}`, label: `${r.name} (${s.name}, ${s.source})` })),
]);
/** "elf|phb" -> "Elf", "elf|high|phb" (a subrace: race, name, source) -> "High", for the list of entries when the race isn't loaded */
const nameOfId = (id: string) => { const p = id.split("|"); return title((p.length > 2 ? p[1] : p[0]).replace(/-/g, " ")); };

const race: KindDef = {
  kind: "race", label: ["Race", "Races"], noteKind: "races",
  fields: [
    { key: "size", label: "Size", type: "multiselect", required: true, default: ["Medium"], options: plain(SIZES, (x) => x) },
    ...raceSpeedFields,
    { key: "darkvision", label: "Darkvision (feet)", help: "0: none.", type: "number", min: 0, step: 30 },
    ...abilityFields,
    ...skillFields,
    { key: "tools", label: "Tool proficiencies", help: "Separated by commas.", type: "text" },
    { key: "weapons", label: "Weapon proficiencies", help: "Separated by commas.", type: "text", placeholder: "Longsword, shortbow" },
    { key: "armor", label: "Armour proficiencies", help: "Separated by commas.", type: "text", placeholder: "Light armor" },
    { key: "languages", label: "Languages", help: "Separated by commas.", type: "text", placeholder: "Common, Elvish" },
    traitsField,
    { key: "subraceRequired", label: "A subrace must be chosen", help: "Character Creation asks for one while none is chosen.", type: "checkbox" },
  ],
  apply: (e, data) => {
    const d = e.data, problem = clash(data.races, e);
    if (problem) return problem;
    const out: RaceData = {
      id: e.id, name: e.name, source: CUSTOM_SOURCE, link: null, size: strs(d, "size").length ? strs(d, "size") : ["Medium"], speed: speedsOf(d, true),
      ability: abilityOptions(d), darkvision: num(d, "darkvision") || null, skills: skillsOf(d), tools: fixedList(d, "tools"), weapons: fixedList(d, "weapons"),
      armor: fixedList(d, "armor"), languages: commaList(str(d, "languages")), feats: null, traits: traitsOf(d), spells: null, subraces: [], subraceRequired: bool(d, "subraceRequired"),
    };
    data.races.push(out);
    return null;
  },
  summary: (e) => [strs(e.data, "size").join("/"), `${num(e.data, "walk") || 30} ft.`].filter(Boolean).join(", "),
  manual: { section: "race", label: "race", fill: (e, s) => {
    s.manual.race = e.name;
    for (const t of traitsOf(e.data)) if (!s.manual.raceFeatures.includes(t.name)) s.manual.raceFeatures.push(t.name);
  } },
};

const subrace: KindDef = {
  kind: "subrace", label: ["Subrace", "Subraces"], noteKind: "races", parentKey: "race",
  noteName: (e, data) => `${data.races.find((r) => r.id === str(e.data, "race"))?.name ?? ""} (${e.name})`,
  fields: [
    { key: "race", label: "Race", help: "The race it is a subrace of: one of the rules data or your own.", type: "select", required: true, options: raceChoices },
    ...abilityFields,
    { key: "overwriteAbility", label: "Replaces the race's ability score increases", type: "checkbox" },
    ...subraceSenseFields,
    ...skillFields,
    { key: "languages", label: "Extra languages", help: "Separated by commas.", type: "text" },
    { key: "hpPerLevel", label: "Hit points per level", help: "Extra hit points at each level, as the hill dwarf's.", type: "number", min: 0, max: 5 },
    traitsField,
  ],
  apply: (e, data) => {
    const d = e.data, raceId = str(d, "race");
    const sub: SubraceData = {
      id: e.id, name: e.name, source: CUSTOM_SOURCE, link: null, ability: abilityOptions(d).length ? abilityOptions(d) : null, overwriteAbility: bool(d, "overwriteAbility"),
      speed: Object.keys(speedsOf(d, false)).length ? speedsOf(d, false) : null, darkvision: num(d, "darkvision") || null, skills: skillsOf(d),
      languages: commaList(str(d, "languages")), traits: traitsOf(d), spells: null, hpPerLevel: num(d, "hpPerLevel"),
    };
    let problem: string | null = null;
    const found = changeRace(data, raceId, (r) => { if (r.subraces.some((x) => x.id === e.id)) problem = "another entry has the same id"; else r.subraces.push(sub); });
    return found ? problem : `its race (${nameOfId(raceId) || "none"}) is not in the rules data`;
  },
  summary: (e) => `Subrace of ${nameOfId(str(e.data, "race"))}`,
  manual: { section: "subrace", label: "subrace", fill: (e, s) => {
    s.manual.subrace = e.name;
    for (const t of traitsOf(e.data)) if (!s.manual.raceFeatures.includes(t.name)) s.manual.raceFeatures.push(t.name);
  } },
};

const raceFeature: KindDef = {
  // a trait for a race of the rules data (your own races have their traits in their forms); it is part of
  // its race's note, so it has no note of its own
  kind: "race-feature", label: ["Race trait", "Race traits"], noteKind: "", parentKey: "of",
  available: (ctx) => (dataRaceChoices(ctx).length ? null : "Traits are added to races of the SRD or imported rules data; your own races have theirs in their form."),
  fields: [
    { key: "of", label: "Race or subrace", help: "A race or subrace of the rules data, to add the trait to. Your own races and subraces have their traits in their own form.", type: "select", required: true, options: dataRaceChoices },
    { key: "text", label: "Text", type: "markdown", required: true },
  ],
  apply: (e, data) => {
    const [raceId, subId] = str(e.data, "of").split(SUB);
    const trait = { name: e.name, text: str(e.data, "text") };
    let missing = false;
    const found = changeRace(data, raceId, (r) => {
      if (!subId) { r.traits.push(trait); return; }
      const i = r.subraces.findIndex((x) => x.id === subId);
      if (i < 0) { missing = true; return; }
      r.subraces[i] = { ...r.subraces[i], traits: [...r.subraces[i].traits, trait] };
    });
    return !found || missing ? `its ${subId ? "subrace" : "race"} (${nameOfId(subId ?? raceId) || "none"}) is not in the rules data` : null;
  },
  summary: (e) => {
    const [raceId, subId] = str(e.data, "of").split(SUB);
    return `Trait of ${nameOfId(raceId)}${subId ? ` (${nameOfId(subId)})` : ""}`;
  },
  manual: { section: "race-features", label: "race trait", fill: (e, s) => { if (!s.manual.raceFeatures.includes(e.name)) s.manual.raceFeatures.push(e.name); } },
};

/** The custom entries of the 2014 rules, in the order they are added to the data (an entry's parent first). */
export const RULESET_2014: Ruleset = { id: "5e-2014", label: "D&D 5e (2014)", kinds: [race, subrace, raceFeature, background, feat, spell, item] };
