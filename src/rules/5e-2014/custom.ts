// The custom entries of the 2014 rules: the kinds a player can make, their fields, and how each becomes
// rules data (the types of src/rules/engine.ts) or fills the free text of manual mode.
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability, type AbilityOption, type BackgroundData, type ClassData, type Compendium, type FeatData, type Feature, type FeatureUses, type Spellcasting, type SubclassData, type ItemData, type ProfList, type RaceData, type Speeds, type SpellData, type SubraceData } from "../engine.ts";
import { CUSTOM_SOURCE, type CustomEntry } from "../../custom/format.ts";
import { PROFILE_2014 } from "../engine.ts";
import { bool, commaList, num, rows, str, strs, type Choice, type CustomContext, type FieldDef, type KindDef, type Ruleset } from "../../custom/schema.ts";
import { lc, title } from "../../text.ts";

const ORDINAL = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const WEAPON_PROPERTIES = ["ammunition", "finesse", "heavy", "light", "loading", "reach", "special", "thrown", "two-handed", "versatile"];
const RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact"];
const plain = (list: string[], label = title): Choice[] => list.map((x) => ({ value: x, label: label(x) }));
export const abilityChoices: Choice[] = ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a] }));
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
/** Options grouped by the book they come from (your own under "Custom data"), as the sheet's menus list them; `source`: each one's. */
function bySource(ctx: CustomContext, list: (Choice & { source: string })[]): Choice[] {
  const book = (s: string) => ctx.data.meta.sources[s] ?? s;
  return list.map(({ source, ...c }) => ({ ...c, group: book(source) })).sort((a, b) => (a.group === b.group ? 0 : a.group.localeCompare(b.group)));
}
const raceChoices = (ctx: CustomContext): Choice[] => bySource(ctx, ctx.data.races.map((r) => ({ value: r.id, label: r.source === CUSTOM_SOURCE ? r.name : `${r.name} (${r.source})`, source: r.source })));
/** A race-feature's parent: "raceId" or "raceId>subraceId" */
const SUB = ">";
/** The races and subraces of the rules data (not custom ones: their traits are in their own forms). */
const dataRaceChoices = (ctx: CustomContext): Choice[] => bySource(ctx, ctx.data.races.filter((r) => r.source !== CUSTOM_SOURCE).flatMap((r) => [
  { value: r.id, label: `${r.name} (${r.source})`, source: r.source },
  ...r.subraces.filter((s) => s.source !== CUSTOM_SOURCE).map((s) => ({ value: `${r.id}${SUB}${s.id}`, label: `${r.name} (${s.name}, ${s.source})`, source: r.source })),
]));
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

// ---------------------------------------------------------------- classes, subclasses and their features
/**
 * A value for each level 1–20 from "1: 2, 4: 3, 10: 4" (from a level on; none before the first), or
 * from 20 values separated by commas. Numbers are numbers, other values ("1d6") text.
 */
export function levelValues(text: string): (number | string | null)[] {
  const value = (v: string) => (/^\d+$/.test(v) ? parseInt(v) : v);
  const parts = text.split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.some((p) => p.includes(":"))) return Array.from({ length: 20 }, (_, i) => (parts[i] != null ? value(parts[i]) : null));
  const out = Array<number | string | null>(20).fill(null);
  const steps = parts.map((p) => p.split(":").map((x) => x.trim())).filter(([l, v]) => parseInt(l) >= 1 && v).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  for (const [l, v] of steps) for (let i = Math.min(20, parseInt(l)) - 1; i < 20; i++) out[i] = value(v);
  return out;
}
export const numbersByLevel = (text: string) => (text.trim() ? levelValues(text).map((v) => (typeof v === "number" ? v : 0)) : null);
export const LEVELS_HELP = "By level: \"1: 2, 4: 3, 10: 4\" (from that level on), or 20 values separated by commas.";
const USES: Choice[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}` })),
  { value: "pb", label: "Proficiency bonus" }, ...ABILITIES.map((a) => ({ value: a, label: `${ABILITY_NAMES[a]} modifier` })),
];
function usesOf(d: Record<string, unknown>): FeatureUses | undefined {
  const u = str(d, "uses");
  if (!u) return undefined;
  const rest = str(d, "rest") === "short" ? "short" : "long";
  return { max: u === "pb" || isAbility(u) ? u : Math.max(1, parseInt(u) || 1), rest };
}
const restField: FieldDef = { key: "rest", label: "Uses come back", type: "select", default: "long", options: [{ value: "long", label: "Long rest" }, { value: "short", label: "Short or long rest" }] };
const usesFields = (visible?: (d: Record<string, unknown>) => boolean): FieldDef[] => [
  { key: "uses", label: "Uses", help: "Tracked with the class resources. None: not tracked.", type: "select", options: USES },
  { ...restField, visible: (d) => !!str(d, "uses") && (!visible || visible(d)) },
];
const featuresField: FieldDef = { key: "features", label: "Features", help: "Shown in Class Features from their level on.", type: "list", addLabel: "+ Add a feature", of: [
  { key: "name", label: "Name", type: "text" }, { key: "level", label: "Level", type: "number", min: 1, max: 20, default: 1 },
  { key: "uses", label: "Uses", type: "select", options: USES }, restField, { key: "text", label: "Text", type: "markdown" },
] };
const featuresOf = (d: Record<string, unknown>): Feature[] => rows(d, "features").filter((r) => str(r, "name"))
  .map((r) => ({ name: str(r, "name"), level: Math.max(1, Math.min(20, num(r, "level") || 1)), source: CUSTOM_SOURCE, text: str(r, "text"), link: null, ...(usesOf(r) ? { uses: usesOf(r) } : {}) }))
  .sort((a, b) => a.level - b.level);

const castsSpells = (d: Record<string, unknown>) => !!str(d, "castingAbility");
const preparesSpells = (d: Record<string, unknown>) => castsSpells(d) && str(d, "preparation") === "prepared" && str(d, "progression") !== "pact";
/** Spellcasting: the ability, how slots progress, prepared or known spells, cantrips and the spell list. `third`: a subclass's (one third caster) */
const spellcastingFields = (third: boolean): FieldDef[] => [
  { key: "castingAbility", label: "Spellcasting ability", help: "None: no spellcasting.", type: "select", options: abilityChoices },
  ...(third ? [] : [{ key: "progression", label: "Spell slots", type: "select", default: "full", visible: castsSpells, options: [
    { value: "full", label: "Full caster (as a wizard)" }, { value: "1/2", label: "Half caster (as a paladin)" }, { value: "1/3", label: "Third caster (as an eldritch knight)" },
    { value: "pact", label: "Pact magic (as a warlock)" }] } as FieldDef]),
  { key: "preparation", label: "Spells", type: "select", default: "known", visible: (d) => castsSpells(d) && str(d, "progression") !== "pact",
    options: [{ value: "known", label: "Known (a set number)" }, { value: "prepared", label: "Prepared each day (from the whole list)" }] },
  { key: "preparedCount", label: "Spells prepared", type: "select", default: "level", visible: preparesSpells,
    options: [{ value: "level", label: "Level + ability modifier" }, { value: "half", label: "Half level + ability modifier" }] },
  { key: "cantrips", label: "Cantrips known", help: LEVELS_HELP, type: "text", placeholder: "1: 2, 4: 3, 10: 4", visible: castsSpells },
  { key: "known", label: "Spells known", help: LEVELS_HELP, type: "text", placeholder: "1: 2, 2: 3, 3: 4", visible: (d) => castsSpells(d) && !preparesSpells(d) },
  { key: "spellList", label: "Spell list", help: third ? "The class whose spells it casts." : "Empty: its own (custom spells can be put on it).", type: "select", visible: castsSpells,
    options: (ctx) => [...new Set(ctx.data.classes.map((c) => c.name))].sort().map((n) => ({ value: n, label: n })) },
];
/** The warlock's pact slots: how many, of which level, at each level */
const PACT_SLOTS = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4].map((slots, i) => ({ slots, level: Math.min(5, Math.ceil((i + 1) / 2)) }));
function spellcastingOf(d: Record<string, unknown>, ownList: string, third: boolean): Spellcasting | null {
  const ability = str(d, "castingAbility");
  if (!isAbility(ability)) return null;
  const progression = third ? "1/3" : str(d, "progression") || "full";
  const prepared = preparesSpells(d) ? `<$level$>${str(d, "preparedCount") === "half" ? " / 2" : ""} + <$${ability}_mod$>` : null;
  return { ability, progression, prepared, cantrips: numbersByLevel(str(d, "cantrips")), known: prepared ? null : numbersByLevel(str(d, "known")), knownFixed: null, list: str(d, "spellList") || ownList };
}
/** Replace class `id` in the data with `change` of a copy (see changeRace). False: no such class. */
function changeClass(data: Compendium, id: string, change: (c: ClassData) => void) {
  const i = data.classes.findIndex((c) => c.id === id);
  if (i < 0) return false;
  const copy = { ...data.classes[i], features: [...data.classes[i].features], subclasses: [...data.classes[i].subclasses] };
  change(copy);
  data.classes[i] = copy;
  return true;
}
const classChoices = (ctx: CustomContext): Choice[] => bySource(ctx, ctx.data.classes.map((c) => ({ value: c.id, label: c.source === CUSTOM_SOURCE ? c.name : `${c.name} (${c.source})`, source: c.source })));
/** The classes and subclasses of the rules data (custom ones have their features in their forms); a subclass is "classId>subclassId" */
const dataClassChoices = (ctx: CustomContext): Choice[] => bySource(ctx, ctx.data.classes.filter((c) => c.source !== CUSTOM_SOURCE).flatMap((c) => [
  { value: c.id, label: `${c.name} (${c.source})`, source: c.source },
  ...c.subclasses.filter((s) => s.source !== CUSTOM_SOURCE).map((s) => ({ value: `${c.id}${SUB}${s.id}`, label: `${c.name}: ${s.name} (${s.source})`, source: c.source })),
]));

const klass: KindDef = {
  kind: "class", label: ["Class", "Classes"], noteKind: "classes",
  fields: [
    { key: "hd", label: "Hit die", type: "select", required: true, default: "8", options: [6, 8, 10, 12].map((n) => ({ value: String(n), label: `d${n}` })) },
    { key: "saves", label: "Saving throws", type: "multiselect", options: abilityChoices },
    { key: "armor", label: "Armour proficiencies", help: "Separated by commas.", type: "text", placeholder: "light, medium, shield" },
    { key: "weapons", label: "Weapon proficiencies", help: "Separated by commas.", type: "text", placeholder: "simple, martial" },
    { key: "tools", label: "Tool proficiencies", help: "Separated by commas.", type: "text" },
    { key: "skillChoices", label: "Skills to choose", type: "number", min: 0, max: 6, default: 2 },
    { key: "skillChoiceFrom", label: "Skills to choose from", help: "None picked: any skill.", type: "multiselect", options: skillChoices, visible: (d) => num(d, "skillChoices") > 0 },
    ...spellcastingFields(false),
    { key: "subclassTitle", label: "Subclass title", help: "What its subclasses are called. Empty: it has none.", type: "text", default: "Subclass", placeholder: "Martial Archetype" },
    { key: "subclassLevel", label: "Subclass level", type: "number", min: 1, max: 20, default: 3, visible: (d) => !!str(d, "subclassTitle") },
    featuresField,
    { key: "columns", label: "Class table", help: "Counts shown with the class resources, such as Ki Points or Rages. " + LEVELS_HELP, type: "list", addLabel: "+ Add a column", of: [
      { key: "label", label: "Name", type: "text" }, { key: "values", label: "By level", type: "text" },
    ] },
    { key: "multiclass", label: "Multiclassing requirements", help: "The ability scores it takes to multiclass into it.", type: "list", addLabel: "+ Add a requirement", of: [
      { key: "ability", label: "Ability", type: "select", options: abilityChoices }, { key: "score", label: "At least", type: "number", min: 1, max: 30, default: 13 },
    ] },
    { key: "multiclassArmor", label: "Armour proficiencies when multiclassing", help: "Separated by commas.", type: "text" },
    { key: "multiclassWeapons", label: "Weapon proficiencies when multiclassing", help: "Separated by commas.", type: "text" },
  ],
  apply: (e, data) => {
    const d = e.data, problem = clash(data.classes, e);
    if (problem) return problem;
    const title = str(d, "subclassTitle"), level = Math.max(1, Math.min(20, num(d, "subclassLevel") || 3));
    const from = strs(d, "skillChoiceFrom").filter((k) => k in SKILLS), count = num(d, "skillChoices");
    const spellcasting = spellcastingOf(d, e.name, false);
    const requirements: Record<string, number> = {};
    for (const r of rows(d, "multiclass")) { const a = str(r, "ability"); if (isAbility(a)) requirements[a] = num(r, "score") || 13; }
    const features = featuresOf(d);
    // where the subclass comes, as the classes of the data have it: the sheet shows the subclass's features there
    if (title) features.push({ name: title, level, source: CUSTOM_SOURCE, text: `You choose a ${lc(title)}, which grants you features at certain levels.`, link: null, subclassFeature: true });
    const out: ClassData = {
      id: e.id, name: e.name, source: CUSTOM_SOURCE, link: null, hd: num(d, "hd") || 8, saves: strs(d, "saves").filter(isAbility),
      armor: commaList(str(d, "armor")), weapons: commaList(str(d, "weapons")), tools: commaList(str(d, "tools")),
      skills: count > 0 ? [{ from: from.length ? from : "any", count }] : [],
      spellcasting, pactSlots: spellcasting?.progression === "pact" ? PACT_SLOTS : null,
      tableCols: rows(d, "columns").filter((r) => str(r, "label")).map((r) => ({ label: str(r, "label"), rows: levelValues(str(r, "values")) })),
      subclassTitle: title, subclassLevel: title ? level : 21, features: features.sort((a, b) => a.level - b.level),
      multiclass: { requirements, armor: commaList(str(d, "multiclassArmor")), weapons: commaList(str(d, "multiclassWeapons")), skills: [] }, subclasses: [],
    };
    data.classes.push(out);
    return null;
  },
  summary: (e) => [`d${num(e.data, "hd") || 8}`, str(e.data, "castingAbility") ? `${str(e.data, "castingAbility").toUpperCase()} caster` : ""].filter(Boolean).join(", "),
  manual: { section: "class", label: "class", fill: (e, s) => {
    s.manual.classes.push({ name: e.name, subclass: "", level: 1 });
    for (const f of featuresOf(e.data)) if (f.level <= 1 && !s.manual.classFeatures.includes(f.name)) s.manual.classFeatures.push(f.name);
  } },
};

const subclass: KindDef = {
  kind: "subclass", label: ["Subclass", "Subclasses"], noteKind: "classes", parentKey: "class",
  fields: [
    { key: "class", label: "Class", help: "The class it is a subclass of: one of the rules data or your own.", type: "select", required: true, options: classChoices },
    featuresField,
    { key: "alwaysPrepared", label: "Spells always prepared", help: "Spells it grants at a class level (domain, oath or circle spells), by name, separated by commas.", type: "list", addLabel: "+ Add spells", of: [
      { key: "level", label: "Class level", type: "number", min: 1, max: 20, default: 1 }, { key: "spells", label: "Spells", type: "text" },
    ] },
    ...spellcastingFields(true),
  ],
  apply: (e, data) => {
    const d = e.data, classId = str(d, "class");
    const prepared: Record<string, string[]> = {};
    for (const r of rows(d, "alwaysPrepared")) { const names = commaList(str(r, "spells")).map(lc); if (names.length) (prepared[String(num(r, "level") || 1)] ??= []).push(...names); }
    const parent = data.classes.find((c) => c.id === classId);
    const sub: SubclassData = {
      id: e.id, name: e.name, shortName: e.name, source: CUSTOM_SOURCE, link: null, features: featuresOf(d),
      spellcasting: parent?.spellcasting ? null : spellcastingOf(d, "Wizard", true), additionalSpells: Object.keys(prepared).length ? [{ prepared }] : null,
    };
    let problem: string | null = null;
    const found = changeClass(data, classId, (c) => { if (c.subclasses.some((x) => x.id === e.id)) problem = "another entry has the same id"; else c.subclasses.push(sub); });
    return found ? problem : `its class (${nameOfId(classId) || "none"}) is not in the rules data`;
  },
  summary: (e) => `Subclass of ${nameOfId(str(e.data, "class"))}`,
  manual: { section: "subclass", label: "subclass", fill: (e, s) => {
    const cls = nameOfId(str(e.data, "class"));
    const target = s.manual.classes.find((c) => lc(c.name) === lc(cls)) ?? s.manual.classes[s.manual.classes.length - 1];
    if (target) target.subclass = e.name; else s.manual.classes.push({ name: cls, subclass: e.name, level: 1 });
    for (const f of featuresOf(e.data)) if (!s.manual.classFeatures.includes(f.name) && f.level <= (target?.level ?? 1)) s.manual.classFeatures.push(f.name);
  } },
};

const classFeature: KindDef = {
  // a feature for a class of the rules data (your own classes have their features in their forms); it
  // is part of its class's note, so it has no note of its own
  kind: "class-feature", label: ["Class feature", "Class features"], noteKind: "", parentKey: "of",
  available: (ctx) => (dataClassChoices(ctx).length ? null : "Features are added to classes of the SRD or imported rules data; your own classes have theirs in their form."),
  fields: [
    { key: "of", label: "Class or subclass", help: "A class or subclass of the rules data, to add the feature to. Your own classes and subclasses have their features in their own form.", type: "select", required: true, options: dataClassChoices },
    { key: "level", label: "Level", type: "number", min: 1, max: 20, default: 1, required: true },
    ...usesFields(),
    { key: "text", label: "Text", type: "markdown", required: true },
  ],
  apply: (e, data) => {
    const [classId, subId] = str(e.data, "of").split(SUB);
    const uses = usesOf(e.data);
    const f: Feature = { name: e.name, level: Math.max(1, Math.min(20, num(e.data, "level") || 1)), source: CUSTOM_SOURCE, text: str(e.data, "text"), link: null, ...(uses ? { uses } : {}) };
    const byLevel = (a: Feature, b: Feature) => a.level - b.level;
    let missing = false;
    const found = changeClass(data, classId, (c) => {
      if (!subId) { c.features = [...c.features, f].sort(byLevel); return; }
      const i = c.subclasses.findIndex((x) => x.id === subId);
      if (i < 0) { missing = true; return; }
      c.subclasses[i] = { ...c.subclasses[i], features: [...c.subclasses[i].features, f].sort(byLevel) };
    });
    return !found || missing ? `its ${subId ? "subclass" : "class"} (${nameOfId(subId ?? classId) || "none"}) is not in the rules data` : null;
  },
  summary: (e) => {
    const [classId, subId] = str(e.data, "of").split(SUB);
    return `${nameOfId(classId)}${subId ? ` (${nameOfId(subId)})` : ""}, level ${num(e.data, "level") || 1}`;
  },
  manual: { section: "class-features", label: "class feature", fill: (e, s) => { if (!s.manual.classFeatures.includes(e.name)) s.manual.classFeatures.push(e.name); } },
};

/** The custom entries of the 2014 rules, in the order they are added to the data (an entry's parent first). */
/** The kinds of entries; the 2024 rules change some of them (src/rules/5e-2024/custom.ts). */
export const KINDS_5E: KindDef[] = [race, subrace, raceFeature, klass, subclass, classFeature, background, feat, spell, item];
export const RULESET_2014: Ruleset = { id: "5e-2014", label: "D&D 5e (2014)", kinds: KINDS_5E, profile: PROFILE_2014 };
