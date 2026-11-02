// The custom entries of the 2014 rules: the kinds a player can make, their fields, and how each becomes
// rules data (the types of src/rules/engine.ts) or fills the free text of manual mode.
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability, type AbilityOption, type BackgroundData, type FeatData, type ItemData, type SpellData } from "../engine.ts";
import { CUSTOM_SOURCE, type CustomEntry } from "../../custom/format.ts";
import { bool, commaList, num, rows, str, strs, type Choice, type FieldDef, type KindDef, type Ruleset } from "../../custom/schema.ts";
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

/** The custom entries of the 2014 rules, in the order they are added to the data (an entry's parent first). */
export const RULESET_2014: Ruleset = { id: "5e-2014", label: "D&D 5e (2014)", kinds: [background, feat, spell, item] };
