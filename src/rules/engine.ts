// Pure D&D 5e (2014) rules engine: no Obsidian imports, so it can be unit tested in Node.
// Note: written with erasable TypeScript only (no enums/namespaces) so Node can strip types.

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_NAMES: Record<Ability, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export const SKILLS: Record<string, Ability> = {
  "acrobatics": "dex", "animal handling": "wis", "arcana": "int", "athletics": "str", "deception": "cha",
  "history": "int", "insight": "wis", "intimidation": "cha", "investigation": "int", "medicine": "wis",
  "nature": "int", "perception": "wis", "performance": "cha", "persuasion": "cha", "religion": "int",
  "sleight of hand": "dex", "stealth": "dex", "survival": "wis",
};
export const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned"];
export const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
// Full-caster slot table, index = caster level (1..20), value = slots for spell levels 1..9
export const FULL_CASTER_SLOTS: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// ------------------------------------------------------------------ data types (from compendium-2014.json)
export interface AbilityOption { label: string; fixed: Partial<Record<Ability, number>>; choose: { from: Ability[]; count: number; amount: number; distinct?: boolean }[] }
export interface ProfList { fixed: string[]; choose: { from: string[] | "any"; count: number }[] }
export interface Feature { name: string; level: number; source: string; text: string; link: string | null; optional?: boolean; subclassFeature?: boolean }
export interface Spellcasting { ability: Ability; progression: string; prepared?: string | null; cantrips?: number[] | null; known?: number[] | null; knownFixed?: number[] | null; list: string | null }
/** speeds in feet; "walk" means "equal to your walking speed" */
export type Speeds = Record<string, number | string>;
export interface SubraceData { id: string; name: string; source: string; link: string | null; ability: AbilityOption[] | null; overwriteAbility: boolean; speed: Speeds | null; darkvision: number | null; skills: ProfList; languages: string[]; resist: unknown[]; traits: { name: string; text: string }[]; spells: AdditionalSpells[] | null; hpPerLevel: number }
export interface RaceData { id: string; name: string; source: string; link: string | null; size: string[]; speed: Speeds; ability: AbilityOption[]; darkvision: number | null; skills: ProfList; tools: ProfList; weapons: ProfList; armor: ProfList; languages: string[]; resist: unknown[]; feats: unknown; traits: { name: string; text: string }[]; spells: AdditionalSpells[] | null; subraces: SubraceData[]; subraceRequired: boolean }
export interface SubclassData { id: string; name: string; shortName: string; source: string; link: string | null; features: Feature[]; spellcasting: Spellcasting | null; additionalSpells: AdditionalSpells[] | null;
  /** ids of spells added to the class's spell list for this subclass only (homebrew `subclassSpells`) */
  spells?: string[] }
export interface ClassData { id: string; name: string; source: string; link: string | null; hd: number; saves: Ability[]; armor: string[]; weapons: string[]; tools: string[]; skills: { from: string[] | "any"; count: number }[]; spellcasting: Spellcasting | null; pactSlots: { slots: number; level: number }[] | null; tableCols: { label: string; rows: (string | number | null)[] }[]; subclassTitle: string; subclassLevel: number; features: Feature[]; multiclass: { requirements: Record<string, unknown>; armor: string[]; weapons: string[]; skills: { from: string[]; count: number }[] } | null; subclasses: SubclassData[] }
export interface BackgroundData { id: string; name: string; source: string; link: string | null; skills: ProfList; tools: ProfList; languages: string[]; feature: { name: string; heading?: string; text: string; link: string | null } | null; feats: unknown }
export interface FeatData { id: string; name: string; source: string; link: string | null; prereq: string; ability: AbilityOption[]; text: string }
export interface SpellData { id: string; name: string; source: string; link: string | null; level: number; school: string; time: string; range: string; components: string; duration: string; concentration: boolean; ritual: boolean; classes: string[]; attack: boolean; save: string | null; damage: string[]; text: string }
export interface ItemData { id: string; name: string; source: string; link: string | null; kind: "armor" | "weapon" | "gear"; armorType: string | null; ac: number | null; strength: number | null; stealth: boolean; weaponCategory: string | null; ranged: boolean; dmg1: string | null; dmg2: string | null; dmgType: string | null; properties: string[]; range: string | null; weight: number | null; value: number | null; magic: boolean; rarity: string | null; attunement: boolean; bonusAc: number; bonusWeapon: number; baseItem: string | null }
export type AdditionalSpells = { ability?: unknown; known?: Record<string, unknown>; prepared?: Record<string, unknown>; innate?: Record<string, unknown>; expanded?: Record<string, unknown> };
export interface Compendium { meta: { sources: Record<string, string>; srdOnly?: boolean; attribution?: string; generated?: string; importVersion?: number }; races: RaceData[]; classes: ClassData[]; backgrounds: BackgroundData[]; feats: FeatData[]; spells: SpellData[]; items: ItemData[] }

// ------------------------------------------------------------------ character state (stored in frontmatter `dnd`)
export type ProfLevel = 0 | 1 | 2; // none / proficient / expertise
export interface ClassEntry { id: string; subclass: string | null; level: number; hpRolls: (number | null)[]; skills: string[] }
export interface SpellEntry { id: string; prepared: boolean; source?: string } // source: class id that grants it
export interface InventoryEntry { id: string | null; name: string; qty: number; weight: number | null; equipped: boolean; attuned: boolean; notes: string }
export interface FeatEntry { id: string; picks: Ability[]; free?: boolean } // free: granted by race/background, not an ASI
export interface CharState {
  version: number;
  name: string; player: string; image: string; alignment: string; xp: number;
  race: string | null; subrace: string | null;
  raceAbility: { option: number; picks: Ability[] };
  raceSkills: string[];
  background: string | null;
  classes: ClassEntry[];
  abilities: { method: "manual" | "standard" | "pointbuy" | "roll"; base: Record<Ability, number>; asi: Record<Ability, number>; adjust: Record<Ability, number> };
  feats: FeatEntry[];
  skills: Record<string, ProfLevel>; // explicit overrides; undefined = automatic
  saves: Partial<Record<Ability, ProfLevel>>;
  hp: { current: number | null; temp: number; adjust: number; override: number | null };
  hitDiceUsed: number;
  ac: { adjust: number; override: number | null };
  speedAdjust: number; initiativeAdjust: number;
  deathSaves: { success: number; fail: number };
  inspiration: boolean; exhaustion: number; conditions: string[];
  spells: SpellEntry[];
  slots: { adjust: number[]; used: number[]; pactUsed: number };
  resources: Record<string, number>;
  inventory: InventoryEntry[];
  coins: { cp: number; sp: number; ep: number; gp: number; pp: number };
  proficiencies: { armor: string; weapons: string; tools: string; languages: string };
  personality: { traits: string; ideals: string; bonds: string; flaws: string };
  appearance: { age: string; height: string; weight: string; eyes: string; skin: string; hair: string };
  allies: string;
  biography: string; diary: string; events: string[];
  /** the player's notes on class, race and background features, by featureKey() */
  featureNotes: Record<string, string>;
  /** one-off features the player added (with rules data) */
  customFeatures: CustomFeature[];
  /** data features the player hid, by featureKey(); they are listed so they can be shown again */
  hiddenFeatures: string[];
  manual: ManualData; // used when no rules data is configured (manual mode)
  /** `hidden`: sections left out of this sheet (shown again from the "Hidden sections" menu) */
  ui: { collapsed: Record<string, boolean>; sourceFilter: string[]; editing: Record<string, boolean>; hidden: Record<string, boolean> };
}

const zeroAbilities = (): Record<Ability, number> => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });
export function newCharacter(name = ""): CharState {
  return {
    version: 1, name, player: "", image: "", alignment: "", xp: 0,
    race: null, subrace: null, raceAbility: { option: 0, picks: [] }, raceSkills: [],
    background: null, classes: [],
    abilities: { method: "pointbuy", base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, asi: zeroAbilities(), adjust: zeroAbilities() },
    feats: [], skills: {}, saves: {},
    hp: { current: null, temp: 0, adjust: 0, override: null }, hitDiceUsed: 0,
    ac: { adjust: 0, override: null }, speedAdjust: 0, initiativeAdjust: 0,
    deathSaves: { success: 0, fail: 0 }, inspiration: false, exhaustion: 0, conditions: [],
    spells: [], slots: { adjust: [0, 0, 0, 0, 0, 0, 0, 0, 0], used: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactUsed: 0 },
    resources: {}, inventory: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    proficiencies: { armor: "", weapons: "", tools: "", languages: "" },
    personality: { traits: "", ideals: "", bonds: "", flaws: "" },
    appearance: { age: "", height: "", weight: "", eyes: "", skin: "", hair: "" },
    allies: "", biography: "", diary: "", events: [], featureNotes: {}, customFeatures: [], hiddenFeatures: [], manual: emptyManual(),
    ui: { collapsed: {}, sourceFilter: [], editing: {}, hidden: {} },
  };
}
// Fill in any fields missing from older/partial saved states.
export function normalize(s: Partial<CharState> | null | undefined): CharState {
  const d = newCharacter();
  const out: CharState = { ...d, ...(s || {}) };
  const merge = <T extends object>(base: T, saved: Partial<T> | undefined): T => ({ ...base, ...(saved ?? {}) });
  out.raceAbility = merge(d.raceAbility, s?.raceAbility);
  out.hp = merge(d.hp, s?.hp);
  out.ac = merge(d.ac, s?.ac);
  out.deathSaves = merge(d.deathSaves, s?.deathSaves);
  out.slots = merge(d.slots, s?.slots);
  out.coins = merge(d.coins, s?.coins);
  out.proficiencies = merge(d.proficiencies, s?.proficiencies);
  out.personality = merge(d.personality, s?.personality);
  out.appearance = merge(d.appearance, s?.appearance);
  out.ui = merge(d.ui, s?.ui);
  out.abilities = merge(d.abilities, s?.abilities);
  for (const k of ["base", "asi", "adjust"] as const) out.abilities[k] = merge(d.abilities[k], s?.abilities?.[k]);
  out.classes = (out.classes || []).map((c) => ({ ...c, subclass: c.subclass ?? null, hpRolls: c.hpRolls ?? [], skills: c.skills ?? [], level: Math.max(1, Math.min(20, c.level || 1)) }));
  out.ui.editing = out.ui.editing || {};
  // sheets saved before sections could be hidden show all of them
  out.ui.hidden = out.ui.hidden || {};
  out.events = Array.isArray(out.events) ? out.events.map((e) => String(e ?? "")) : [];
  const notes: unknown = out.featureNotes;
  out.featureNotes = notes && typeof notes === "object" && !Array.isArray(notes) ? Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, String(v ?? "")])) : {};
  out.customFeatures = (Array.isArray(out.customFeatures) ? out.customFeatures : []).filter((f) => f && typeof f === "object").map((f) => ({
    id: String(f.id || newCustomFeature("class").id), kind: f.kind === "race" ? "race" : "class",
    name: String(f.name ?? ""), level: Math.max(1, Math.min(20, Number(f.level) || 1)), text: String(f.text ?? ""),
  }));
  out.hiddenFeatures = Array.isArray(out.hiddenFeatures) ? out.hiddenFeatures.map(String) : [];
  out.manual = { ...emptyManual(), ...(s?.manual || {}) };
  out.feats = (out.feats || []).map((f) => ({ ...f, picks: f.picks || [] }));
  // migrate ASI points stored on the scores (v0.1) into Ability Score Improvement entries
  const legacy: Ability[] = [];
  for (const a of ABILITIES) for (let n = 0; n < (out.abilities.asi[a] || 0); n++) legacy.push(a);
  for (let i = 0; i < legacy.length; i += 2) out.feats.push({ id: ASI_ID, picks: legacy.slice(i, i + 2) });
  out.abilities.asi = zeroAbilities();
  out.slots.adjust = [...out.slots.adjust, ...Array<number>(9).fill(0)].slice(0, 9);
  out.slots.used = [...out.slots.used, ...Array<number>(9).fill(0)].slice(0, 9);
  return out;
}

// ------------------------------------------------------------------ manual mode
// Everything the player types in by hand when there is no rules data. Kept apart from the
// data-driven fields so switching modes never loses information.
export interface ManualClass { name: string; subclass: string; level: number }
export interface ManualSpell { name: string; level: number; prepared: boolean }
export interface ManualData {
  race: string; subrace: string; background: string; classes: ManualClass[];
  ac: number; maxHp: number; speed: number; hitDice: string; spellAbility: Ability | null;
  raceFeatures: string[]; classFeatures: string[]; feats: string[]; spells: ManualSpell[];
}
export function emptyManual(): ManualData {
  return { race: "", subrace: "", background: "", classes: [], ac: 10, maxHp: 1, speed: 30, hitDice: "", spellAbility: null, raceFeatures: [], classFeatures: [], feats: [], spells: [] };
}
/** The state the rules engine sees in manual mode: manual class levels, no data-driven choices. */
export function manualView(s: CharState): CharState {
  return { ...s, race: null, subrace: null, background: null, feats: [],
    classes: s.manual.classes.map((c) => ({ id: "", subclass: null, level: Math.max(1, Math.min(20, c.level || 1)), hpRolls: [], skills: [] })) };
}
/** Spell save DC / attack for manual mode, from the chosen spellcasting ability. */
export function manualCaster(s: CharState, scores: Record<Ability, AbilityBreakdown>) {
  const a = s.manual.spellAbility;
  if (!a) return null;
  const pb = proficiencyBonus(totalLevel(manualView(s)));
  const m = mod(scores[a].total);
  return { ability: a, dc: 8 + pb + m, attack: pb + m };
}

// ------------------------------------------------------------------ lookups
export class Rules {
  data: Compendium;
  constructor(data: Compendium) { this.data = data; }
  race(s: CharState) { return this.data.races.find((r) => r.id === s.race) || null; }
  subrace(s: CharState) { return this.race(s)?.subraces.find((r) => r.id === s.subrace) || null; }
  background(s: CharState) { return this.data.backgrounds.find((b) => b.id === s.background) || null; }
  cls(id: string) { return this.data.classes.find((c) => c.id === id) || null; }
  subclass(e: ClassEntry) { return this.cls(e.id)?.subclasses.find((x) => x.id === e.subclass) || null; }
  spell(id: string) { return this.data.spells.find((x) => x.id === id) || null; }
  item(id: string | null) { return id ? this.data.items.find((x) => x.id === id) || null : null; }
  feat(id: string) { return this.data.feats.find((x) => x.id === id) || null; }
}

// Pseudo-feat id used for an Ability Score Improvement chosen instead of a feat
export const ASI_ID = "asi";
export const mod = (score: number) => Math.floor((score - 10) / 2);
export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
export const totalLevel = (s: CharState) => s.classes.reduce((a, c) => a + (c.level || 0), 0) || 0;
export const proficiencyBonus = (level: number) => Math.ceil(Math.max(1, level) / 4) + 1;
export const levelForXp = (xp: number) => { let l = 1; XP_THRESHOLDS.forEach((t, i) => { if (xp >= t) l = i + 1; }); return l; };

// Racial ability options: the subrace's replace the race's when it overwrites them, otherwise each race
// option is combined with each subrace option (fixed bonuses added, choices appended after the race's,
// so picks saved before subrace choices were supported keep their positions)
export function raceAbilityOptions(r: Rules, s: CharState): AbilityOption[] {
  const sub = r.subrace(s), raceOpts = r.race(s)?.ability || [];
  if (!sub?.ability?.length) return raceOpts;
  if (sub.overwriteAbility || !raceOpts.length) return sub.ability;
  return raceOpts.flatMap((ro) => sub.ability!.map((so) => {
    const fixed = { ...ro.fixed };
    for (const [k, v] of Object.entries(so.fixed)) fixed[k as Ability] = (fixed[k as Ability] || 0) + (v || 0);
    return { label: [ro.label, so.label].filter(Boolean).join(", "), fixed, choose: [...ro.choose, ...so.choose] };
  }));
}
/** `feature` = increases from class features. Scores are not capped: `max` is the ability's maximum
 *  (20, or more from features like Primal Champion) and `over` flags a total above it. */
export interface AbilityBreakdown { base: number; race: number; feat: number; asi: number; feature: number; adjust: number; total: number; max: number; over: boolean }
export const ABILITY_MAX = 20;
// e.g. Primal Champion: "Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24."
const SCORE_BOOST = /your ([a-z ,]+?) scores? increases? by (\d+)\.\s*your maximum for (?:those|that|these) scores? is now (\d+)/i;
/** Ability increases and higher maximums granted by the character's class and subclass features. */
export function featureAbilityBoosts(r: Rules, s: CharState) {
  const bonus = zeroAbilities(), max = zeroAbilities();
  for (const c of classFeatures(r, s)) for (const f of c.features) {
    const m = SCORE_BOOST.exec(f.text || "");
    if (!m) continue;
    for (const a of ABILITIES) if (m[1].toLowerCase().includes(ABILITY_NAMES[a].toLowerCase())) {
      bonus[a] += parseInt(m[2]);
      max[a] = Math.max(max[a], parseInt(m[3]));
    }
  }
  return { bonus, max };
}
export function abilityScores(r: Rules, s: CharState): Record<Ability, AbilityBreakdown> {
  const out = {} as Record<Ability, AbilityBreakdown>;
  const raceBonus = zeroAbilities();
  const opts = raceAbilityOptions(r, s);
  const opt = opts[Math.min(s.raceAbility.option, Math.max(0, opts.length - 1))];
  if (opt) {
    for (const [k, v] of Object.entries(opt.fixed)) raceBonus[k as Ability] += v || 0;
    // picks are stored flat, in order of the option's choose groups
    let i = 0;
    for (const ch of opt.choose) for (let n = 0; n < ch.count; n++, i++) { const a = s.raceAbility.picks[i]; if (a) raceBonus[a] += ch.amount; }
  }
  const featBonus = zeroAbilities();
  const asiBonus = zeroAbilities();
  for (const fe of s.feats) {
    // an Ability Score Improvement taken in place of a feat: two picks of +1 (same ability twice = +2)
    if (fe.id === ASI_ID) { fe.picks.forEach((a) => { if (a) asiBonus[a] += 1; }); continue; }
    const f = r.feat(fe.id);
    const o = f?.ability?.[0];
    if (!o) continue;
    for (const [k, v] of Object.entries(o.fixed)) featBonus[k as Ability] += v || 0;
    let i = 0;
    for (const ch of o.choose) for (let n = 0; n < ch.count; n++, i++) { const a = fe.picks[i]; if (a) featBonus[a] += ch.amount; }
  }
  const boosts = featureAbilityBoosts(r, s);
  for (const a of ABILITIES) {
    const base = s.abilities.base[a] ?? 10, asi = (s.abilities.asi[a] || 0) + asiBonus[a], adjust = s.abilities.adjust[a] || 0;
    const max = Math.max(ABILITY_MAX, boosts.max[a]), feature = boosts.bonus[a];
    const total = base + raceBonus[a] + featBonus[a] + asi + feature + adjust;
    out[a] = { base, race: raceBonus[a], feat: featBonus[a], asi, feature, adjust, total, max, over: total > max };
  }
  return out;
}

/**
 * The single score editor: move one ability up (+1) or down (−1). Point buy spends base points first
 * (up to 15 or until the 27 points run out) and puts the rest in Adjust; going down takes Adjust back
 * first, then base points (refunding them), then makes Adjust negative. The standard array value is
 * picked separately, so the editor only changes Adjust. Manual and rolled scores change the base.
 * Only base and adjust change, so saved characters keep the same fields as before.
 */
export function stepAbility(s: CharState, a: Ability, delta: 1 | -1) {
  const ab = s.abilities;
  if (ab.method === "standard") { ab.adjust[a] = (ab.adjust[a] || 0) + delta; return; }
  if (ab.method !== "pointbuy") { ab.base[a] = Math.max(1, (ab.base[a] ?? 10) + delta); return; }
  const base = ab.base[a] ?? 8, adjust = ab.adjust[a] || 0;
  if (delta > 0) {
    const cost = (POINT_BUY_COST[base + 1] ?? Infinity) - (POINT_BUY_COST[base] ?? Infinity);
    // undo a negative Adjust first, so − then + returns to where it was
    if (adjust < 0) ab.adjust[a] = adjust + 1;
    else if (cost <= pointBuySpent(ab.base).remaining) ab.base[a] = base + 1;
    else ab.adjust[a] = adjust + 1;
  } else {
    if (adjust > 0) ab.adjust[a] = adjust - 1;
    else if (base > 8) ab.base[a] = base - 1;
    else ab.adjust[a] = adjust - 1;
  }
}
export function pointBuySpent(base: Record<Ability, number>) {
  let spent = 0, valid = true;
  for (const a of ABILITIES) { const c = POINT_BUY_COST[base[a]]; if (c == null) valid = false; else spent += c; }
  return { spent, remaining: 27 - spent, valid: valid && spent <= 27 };
}
// Ability Score Improvements available from class levels (each = 2 points)
export function asiSlots(r: Rules, s: CharState) {
  let n = 0;
  for (const e of s.classes) n += (r.cls(e.id)?.features || []).filter((f) => f.name === "Ability Score Improvement" && f.level <= e.level).length;
  return n;
}

// ASIs used: feats and ASI entries in the Feats list (racial feats like Variant Human's don't count),
// plus points from older sheets that stored ASI directly on the scores
export function asiTaken(s: CharState) {
  const legacy = Object.values(s.abilities.asi).reduce((a, b) => a + (b || 0), 0);
  return s.feats.filter((f) => !f.free).length + Math.ceil(legacy / 2);
}

// ------------------------------------------------------------------ proficiencies
export function saveProficiencies(r: Rules, s: CharState): Record<Ability, ProfLevel> {
  const out = {} as Record<Ability, ProfLevel>;
  const first = s.classes[0] ? r.cls(s.classes[0].id) : null; // only the first class grants saves
  for (const a of ABILITIES) out[a] = s.saves[a] ?? (first?.saves.includes(a) ? 1 : 0);
  return out;
}
export function autoSkillSources(r: Rules, s: CharState): Record<string, string[]> {
  const src: Record<string, string[]> = {};
  const add = (k: string, why: string) => { k = k.toLowerCase(); if (!SKILLS[k]) return; (src[k] ||= []).push(why); };
  const bg = r.background(s);
  bg?.skills.fixed.forEach((k) => add(k, bg.name));
  const race = r.race(s), sub = r.subrace(s);
  race?.skills.fixed.forEach((k) => add(k, race.name));
  sub?.skills.fixed.forEach((k) => add(k, sub.name));
  s.raceSkills.forEach((k) => add(k, race?.name || "Race"));
  s.classes.forEach((e) => e.skills.forEach((k) => add(k, r.cls(e.id)?.name || "Class")));
  return src;
}
export function skillProficiencies(r: Rules, s: CharState): Record<string, ProfLevel> {
  const auto = autoSkillSources(r, s);
  const out: Record<string, ProfLevel> = {};
  for (const k of Object.keys(SKILLS)) out[k] = s.skills[k] ?? (auto[k] ? 1 : 0);
  return out;
}
export function skillBonus(r: Rules, s: CharState, skill: string, scores = abilityScores(r, s)) {
  const lvl = skillProficiencies(r, s)[skill] || 0;
  const pb = proficiencyBonus(totalLevel(s));
  // Jack of All Trades (Bard 2+): half proficiency to non-proficient checks
  const jack = lvl === 0 && s.classes.some((e) => r.cls(e.id)?.name === "Bard" && e.level >= 2) ? Math.floor(pb / 2) : 0;
  return mod(scores[SKILLS[skill]].total) + lvl * pb + jack;
}

// ------------------------------------------------------------------ hit points
export function hpBreakdown(r: Rules, s: CharState, scores = abilityScores(r, s)) {
  const con = mod(scores.con.total);
  const level = totalLevel(s);
  let dice = 0;
  s.classes.forEach((e, ci) => {
    const hd = r.cls(e.id)?.hd || 8;
    for (let l = 1; l <= e.level; l++) {
      if (ci === 0 && l === 1) { dice += hd; continue; } // max HD at character level 1
      const roll = e.hpRolls[l - 1];
      dice += roll != null ? roll : hd / 2 + 1;
    }
  });
  const racial = (r.subrace(s)?.hpPerLevel || 0) * level;
  const tough = s.feats.some((f) => r.feat(f.id)?.name === "Tough") ? 2 * level : 0;
  const draconic = s.classes.some((e) => r.subclass(e)?.shortName === "Draconic") ? s.classes.filter((e) => r.subclass(e)?.shortName === "Draconic").reduce((a, e) => a + e.level, 0) : 0;
  const computed = Math.max(level, dice + con * level + racial + tough + draconic) + (s.hp.adjust || 0);
  return { dice, con: con * level, racial, tough, draconic, adjust: s.hp.adjust || 0, max: s.hp.override ?? computed };
}
/** Current HP, never above the maximum or below 0 (no current value yet = full health). */
export function currentHp(s: CharState, max: number) {
  return Math.max(0, Math.min(s.hp.current ?? max, max));
}
export function hitDice(r: Rules, s: CharState) {
  const by: Record<string, number> = {};
  s.classes.forEach((e) => { const hd = `d${r.cls(e.id)?.hd || 8}`; by[hd] = (by[hd] || 0) + e.level; });
  return by;
}

// ------------------------------------------------------------------ armor class
export function armorClass(r: Rules, s: CharState, scores = abilityScores(r, s)) {
  const dex = mod(scores.dex.total);
  const equipped = s.inventory.filter((i) => i.equipped).map((i) => ({ e: i, it: r.item(i.id) }));
  const armor = equipped.find((x) => x.it?.kind === "armor" && x.it.armorType !== "shield");
  const shield = equipped.find((x) => x.it?.armorType === "shield");
  const names = s.classes.map((e) => r.cls(e.id)?.name);
  let base: number, how: string;
  if (armor?.it) {
    const a = armor.it.ac || 10;
    if (armor.it.armorType === "light") { base = a + dex; how = `${armor.it.name} (${a} + DEX)`; }
    else if (armor.it.armorType === "medium") { base = a + Math.min(dex, 2); how = `${armor.it.name} (${a} + DEX max 2)`; }
    else { base = a; how = armor.it.name; }
  } else {
    const options: [number, string][] = [[10 + dex, "Unarmored (10 + DEX)"]];
    if (names.includes("Barbarian")) options.push([10 + dex + mod(scores.con.total), "Unarmored Defense (10 + DEX + CON)"]);
    if (names.includes("Monk") && !shield) options.push([10 + dex + mod(scores.wis.total), "Unarmored Defense (10 + DEX + WIS)"]);
    if (s.classes.some((e) => r.subclass(e)?.shortName === "Draconic")) options.push([13 + dex, "Draconic Resilience (13 + DEX)"]);
    options.sort((a, b) => b[0] - a[0]);
    [base, how] = options[0];
  }
  const shieldBonus = shield?.it ? (shield.it.ac || 2) : 0;
  const magic = equipped.reduce((a, x) => a + (x.it?.bonusAc || 0), 0);
  const computed = base + shieldBonus + magic + (s.ac.adjust || 0);
  return { value: s.ac.override ?? computed, how: how + (shieldBonus ? " + shield" : "") + (magic ? ` + ${magic} magic` : ""), stealthDisadvantage: !!armor?.it?.stealth, strengthRequired: armor?.it?.strength || null };
}

// ------------------------------------------------------------------ speed, initiative, senses, carrying
export function speeds(r: Rules, s: CharState) {
  const raw: Speeds = { ...(r.race(s)?.speed || { walk: 30 }), ...(r.subrace(s)?.speed || {}) };
  const walk = typeof raw.walk === "number" && raw.walk ? raw.walk : 30;
  const out: Record<string, number> = {};
  // a string value means "equal to your walking speed"
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === "number" ? v : walk;
  out.walk = walk + (s.speedAdjust || 0);
  const monk = s.classes.find((e) => r.cls(e.id)?.name === "Monk");
  if (monk) { const col = r.cls(monk.id)!.tableCols.find((c) => c.label === "Unarmored Movement"); const v = parseInt(String(col?.rows[monk.level - 1] ?? 0)); if (v) out.walk += v; }
  if (s.classes.some((e) => r.cls(e.id)?.name === "Barbarian" && e.level >= 5)) out.walk += 10;
  return out;
}
export const initiative = (r: Rules, s: CharState, scores = abilityScores(r, s)) => mod(scores.dex.total) + (s.initiativeAdjust || 0) + (s.feats.some((f) => r.feat(f.id)?.name === "Alert") ? 5 : 0);
export const darkvision = (r: Rules, s: CharState) => r.subrace(s)?.darkvision ?? r.race(s)?.darkvision ?? null;
export const carryingCapacity = (scores: Record<Ability, AbilityBreakdown>) => scores.str.total * 15;
export const inventoryWeight = (s: CharState) => s.inventory.reduce((a, i) => a + (i.weight || 0) * (i.qty || 1), 0) + Object.values(s.coins).reduce((a, n) => a + (n || 0), 0) / 50;

// ------------------------------------------------------------------ features
/**
 * Key for a feature's notes: the id of the class, subclass, race, subrace or background it belongs
 * to, its name and (class features) its level. Ids and names are stable, so notes survive level
 * changes and re-imports; the level tells apart repeated features like Ability Score Improvement.
 */
export function featureKey(owner: string, name: string, level?: number) {
  return [owner, name.trim().toLowerCase(), ...(level != null ? [level] : [])].join("#");
}
/** A feature the player adds to one character: shown in Class Features ("class") or Race & Background Features ("race"). */
export interface CustomFeature { id: string; kind: "class" | "race"; name: string; level: number; text: string }
export function newCustomFeature(kind: CustomFeature["kind"], level = 1): CustomFeature {
  return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, name: "", level: Math.max(1, Math.min(20, level)), text: "" };
}
/** The player's features of one kind, class features by level. */
export function customFeatures(s: CharState, kind: CustomFeature["kind"]) {
  const list = s.customFeatures.filter((f) => f.kind === kind);
  return kind === "class" ? list.sort((a, b) => a.level - b.level) : list;
}
export function classFeatures(r: Rules, s: CharState) {
  const out: { cls: ClassData; sub: SubclassData | null; level: number; features: Feature[] }[] = [];
  for (const e of s.classes) {
    const c = r.cls(e.id);
    if (!c) continue;
    const sub = r.subclass(e);
    // the generic "<Subclass> feature" placeholders are replaced by the real subclass features
    const base = c.features.filter((f) => f.level <= e.level && !(f.subclassFeature && sub && f.level > c.subclassLevel));
    const subF = (sub?.features || []).filter((f) => f.level <= e.level && f.name !== sub!.name);
    out.push({ cls: c, sub, level: e.level, features: [...base, ...subF].sort((a, b) => a.level - b.level) });
  }
  return out;
}
export function classResources(r: Rules, s: CharState) {
  const out: { key: string; label: string; max: number | string }[] = [];
  for (const e of s.classes) {
    const c = r.cls(e.id);
    if (!c) continue;
    for (const col of c.tableCols) {
      const v = col.rows[e.level - 1];
      if (v == null || v === 0 || v === "0" || v === "—") continue;
      out.push({ key: `${c.name}:${col.label}`, label: col.label, max: v });
    }
  }
  return out;
}
export function multiclassRequirementsMet(r: Rules, c: ClassData, scores: Record<Ability, AbilityBreakdown>) {
  const req = c.multiclass?.requirements;
  if (!req || !Object.keys(req).length) return { ok: true, text: "" };
  // { str: 13 } or { or: [{ str: 13 }, { dex: 13 }] }
  const scoresOf = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k, v]) => ABILITIES.includes(k as Ability) && typeof v === "number")) as Record<string, number>;
  const check = (o: Record<string, number>) => Object.entries(o).every(([a, n]) => (scores[a as Ability]?.total || 0) >= n);
  const text = (o: Record<string, number>) => Object.entries(o).map(([a, n]) => `${a.toUpperCase()} ${n}`).join(" and ");
  if (Array.isArray(req.or)) {
    const alternatives = (req.or as Record<string, unknown>[]).map(scoresOf);
    return { ok: alternatives.some(check), text: alternatives.map(text).join(" or ") };
  }
  const plain = scoresOf(req);
  return { ok: check(plain), text: text(plain) };
}

// ------------------------------------------------------------------ spellcasting
/**
 * Evaluates the small arithmetic formulas 5etools uses for prepared spells, once the level and
 * modifiers are filled in (e.g. "5 / 2 + 3"): integers, + - * / and parentheses; division rounds
 * down, as in the rules. Returns null for anything else. No eval.
 */
export function evalFormula(expr: string): number | null {
  const tokens = expr.match(/\d+|[-+*/()]|\S/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const factor = (): number | null => {
    const t = tokens[i++];
    if (t === "-") { const v = factor(); return v == null ? null : -v; }
    if (t === "(") { const v = sum(); return tokens[i++] === ")" ? v : null; }
    return t != null && /^\d+$/.test(t) ? parseInt(t) : null;
  };
  const product = (): number | null => {
    let v = factor();
    while (v != null && (peek() === "*" || peek() === "/")) {
      const op = tokens[i++], r = factor();
      if (r == null || (op === "/" && r === 0)) return null;
      v = op === "*" ? v * r : Math.floor(v / r);
    }
    return v;
  };
  const sum = (): number | null => {
    let v = product();
    while (v != null && (peek() === "+" || peek() === "-")) {
      const op = tokens[i++], r = product();
      if (r == null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  return v != null && i === tokens.length ? Math.floor(v) : null;
}
export interface CasterInfo { key: string; name: string; ability: Ability; dc: number; attack: number; prepared: number | null; cantrips: number | null; known: number | null; list: string | null; classId: string;
  /** ids of spells on this caster's list besides the `list` class's own: its subclass's extra spells */
  spells: string[] }
export function casters(r: Rules, s: CharState, scores = abilityScores(r, s)): CasterInfo[] {
  const pb = proficiencyBonus(totalLevel(s));
  const out: CasterInfo[] = [];
  for (const e of s.classes) {
    const c = r.cls(e.id);
    const sub = r.subclass(e);
    const sc = c?.spellcasting || sub?.spellcasting;
    if (!c || !sc) continue;
    if (sc.progression === "1/2" && c.name !== "Artificer" && e.level < 2) continue;
    if (sc.progression === "1/3" && e.level < 3) continue;
    const m = mod(scores[sc.ability].total);
    let prepared: number | null = null;
    if (sc.prepared) {
      const expr = sc.prepared.replace(/<\$level\$>/g, String(e.level)).replace(/<\$(\w+)_mod\$>/g, (_m: string, a: string) => String(mod(scores[a as Ability]?.total ?? 10)));
      const v = evalFormula(expr);
      prepared = v == null ? null : Math.max(1, v);
    }
    const cantrips = sc.cantrips?.[e.level - 1] ?? null;
    const known = sc.known?.[e.level - 1] ?? sc.knownFixed?.slice(0, e.level).reduce((a, b) => a + b, 0) ?? null;
    out.push({ key: e.id, name: sub?.spellcasting ? `${c.name} (${sub.shortName})` : c.name, ability: sc.ability, dc: 8 + pb + m, attack: pb + m, prepared, cantrips, known: sc.prepared && sc.knownFixed ? known : (sc.prepared ? null : known), list: sc.list, classId: e.id, spells: sub?.spells || [] });
  }
  return out;
}
/** Whether a spell is on a caster's list: its class's list, or one of its subclass's extra spells. */
export const onSpellList = (c: CasterInfo, sp: SpellData) => (!!c.list && sp.classes.includes(c.list)) || c.spells.includes(sp.id);
// Spell slots (levels 1..9) using the single-class table or the multiclass caster table.
export function spellSlots(r: Rules, s: CharState) {
  const entries = s.classes.map((e) => {
    const c = r.cls(e.id), sub = r.subclass(e);
    return { e, c, prog: c?.spellcasting?.progression || sub?.spellcasting?.progression || null };
  }).filter((x) => x.prog && x.prog !== "pact");
  let casterLevel = 0;
  const single = entries.length === 1;
  for (const { e, c, prog } of entries) {
    if (prog === "full") casterLevel += e.level;
    else if (prog === "artificer" || c?.name === "Artificer") casterLevel += Math.ceil(e.level / 2);
    else if (prog === "1/2") casterLevel += single ? (e.level >= 2 ? Math.ceil(e.level / 2) : 0) : Math.floor(e.level / 2);
    else if (prog === "1/3") casterLevel += single ? (e.level >= 3 ? Math.ceil(e.level / 3) : 0) : Math.floor(e.level / 3);
  }
  const base = [...(FULL_CASTER_SLOTS[Math.min(20, casterLevel)] || []), ...Array<number>(9).fill(0)].slice(0, 9);
  const max = base.map((n, i) => Math.max(0, n + (s.slots.adjust[i] || 0)));
  // Warlock pact magic
  let pact: { slots: number; level: number } | null = null;
  for (const e of s.classes) { const c = r.cls(e.id); if (c?.pactSlots) pact = c.pactSlots[e.level - 1] || null; }
  return { casterLevel, base, max, pact };
}
// Spells granted automatically (domain/oath/circle "prepared" lists, racial known spells)
export function grantedSpells(r: Rules, s: CharState): { id: string; why: string }[] {
  const out: { id: string; why: string }[] = [];
  const find = (raw: string) => {
    const [name, src] = String(raw).replace(/#c$/, "").split("|");
    return r.data.spells.find((x) => x.name.toLowerCase() === name.toLowerCase() && (!src || x.source.toLowerCase() === src.toLowerCase()))
      || r.data.spells.find((x) => x.name.toLowerCase() === name.toLowerCase());
  };
  const take = (block: Record<string, unknown> | undefined, upTo: number, why: string) => {
    if (!block) return;
    for (const [lvl, list] of Object.entries(block)) {
      if (parseInt(lvl) > upTo) continue;
      const arr = Array.isArray(list) ? list : Object.values(list as object).flat();
      for (const x of arr as unknown[]) if (typeof x === "string") { const sp = find(x); if (sp) out.push({ id: sp.id, why }); }
    }
  };
  for (const e of s.classes) {
    const sub = r.subclass(e);
    if (sub) for (const a of sub.additionalSpells || []) take(a.prepared, e.level, sub.shortName);
  }
  const lvl = totalLevel(s);
  const race = r.race(s), sub = r.subrace(s);
  const owner = sub?.name ?? race?.name ?? "";
  for (const a of sub?.spells || race?.spells || []) take({ ...a.known, ...a.innate }, lvl, owner);
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
// Spell list sorted: prepared (and granted) first, then by level and name
export function sortedSpells(r: Rules, s: CharState) {
  const granted = new Map(grantedSpells(r, s).map((g) => [g.id, g.why]));
  const rows = s.spells.map((e) => ({ entry: e, data: r.spell(e.id), granted: granted.get(e.id) || null }));
  for (const [id, why] of granted) if (!s.spells.some((e) => e.id === id)) rows.push({ entry: { id, prepared: true }, data: r.spell(id), granted: why });
  const isPrep = (x: (typeof rows)[number]) => x.entry.prepared || !!x.granted || x.data?.level === 0;
  return rows.filter((x) => x.data).sort((a, b) => Number(isPrep(b)) - Number(isPrep(a)) || a.data!.level - b.data!.level || a.data!.name.localeCompare(b.data!.name));
}

// ------------------------------------------------------------------ attacks
export function attacks(r: Rules, s: CharState, scores = abilityScores(r, s)) {
  const pb = proficiencyBonus(totalLevel(s));
  const str = mod(scores.str.total), dex = mod(scores.dex.total);
  const profText = s.classes.flatMap((e) => [...(r.cls(e.id)?.weapons || [])]).join(" ").toLowerCase() + " " + s.proficiencies.weapons.toLowerCase();
  const out: { name: string; toHit: number; damage: string; notes: string; link: string | null }[] = [];
  for (const inv of s.inventory.filter((i) => i.equipped)) {
    const it = r.item(inv.id);
    if (!it || it.kind !== "weapon" || !it.dmg1) continue;
    const finesse = it.properties.includes("finesse");
    const m = it.ranged ? dex : finesse ? Math.max(str, dex) : str;
    const base = it.name.replace(/^\+\d\s+/, "").toLowerCase();
    const prof = profText.includes(it.weaponCategory || "@@") || profText.includes(base) || profText.includes(base + "s");
    const bonus = it.bonusWeapon || 0;
    const dmg = (d: string) => `${d}${m + bonus ? fmtMod(m + bonus) : ""}`;
    out.push({
      name: inv.name || it.name, toHit: m + (prof ? pb : 0) + bonus,
      damage: dmg(it.dmg1) + (it.dmg2 ? ` (${dmg(it.dmg2)} two-handed)` : "") + (it.dmgType ? ` ${it.dmgType}` : ""),
      notes: [...it.properties, it.range ? `range ${it.range}` : ""].filter(Boolean).join(", ") + (prof ? "" : " (not proficient)"),
      link: it.link,
    });
  }
  return out;
}

// ------------------------------------------------------------------ creation checklist
export function pendingChoices(r: Rules, s: CharState): string[] {
  const out: string[] = [];
  const race = r.race(s);
  if (!s.name) out.push("Give the character a name");
  if (!race) out.push("Choose a race");
  else {
    if (race.subraces.length && !s.subrace && race.subraceRequired) out.push(`Choose a ${race.name} subrace`);
    const opt = raceAbilityOptions(r, s)[s.raceAbility.option];
    const need = opt ? opt.choose.reduce((a, c) => a + c.count, 0) : 0;
    if (need > s.raceAbility.picks.filter(Boolean).length) out.push(`Pick ${need} racial ability score increase(s)`);
    const skillChoices = race.skills.choose.reduce((a, c) => a + c.count, 0);
    if (skillChoices > s.raceSkills.length) out.push(`Pick ${skillChoices - s.raceSkills.length} racial skill proficiency(ies)`);
  }
  if (!s.classes.length) out.push("Choose a class");
  s.classes.forEach((e, i) => {
    const c = r.cls(e.id);
    if (!c) return;
    if (!e.subclass && e.level >= c.subclassLevel && c.subclasses.length) out.push(`Choose a ${c.subclassTitle} for ${c.name}`);
    const skillRule = i === 0 ? c.skills[0] : c.multiclass?.skills[0];
    if (skillRule && e.skills.length < skillRule.count) out.push(`Pick ${skillRule.count - e.skills.length} ${c.name} skill proficiency(ies)`);
  });
  if (!s.background) out.push("Choose a background");
  if (s.abilities.method === "pointbuy") { const pbs = pointBuySpent(s.abilities.base); if (!pbs.valid) out.push("Point buy is over 27 points or out of range (8–15)"); else if (pbs.remaining > 0) out.push(`${pbs.remaining} point-buy point(s) unspent`); }
  const free = asiSlots(r, s) - asiTaken(s);
  if (free > 0) out.push(`${free} Ability Score Improvement(s) available — add an ASI or a feat in Feats`);
  if (free < 0) out.push(`${-free} Ability Score Improvement(s) or feat(s) more than your class levels grant — remove them in Feats`);
  s.feats.filter((f) => f.id === ASI_ID && f.picks.filter(Boolean).length < 2).forEach(() => out.push("Choose the abilities for your Ability Score Improvement"));
  const scores = abilityScores(r, s);
  for (const ci of casters(r, s, scores)) {
    const cls = s.spells.filter((x) => x.source === ci.classId);
    const nCantrips = cls.filter((x) => r.spell(x.id)?.level === 0).length;
    if (ci.cantrips && nCantrips < ci.cantrips) out.push(`${ci.name}: choose ${ci.cantrips - nCantrips} more cantrip(s)`);
    const nLevelled = cls.filter((x) => (r.spell(x.id)?.level || 0) > 0).length;
    if (ci.known && nLevelled < ci.known) out.push(`${ci.name}: learn ${ci.known - nLevelled} more spell(s)`);
    if (ci.prepared) { const nPrep = cls.filter((x) => x.prepared && (r.spell(x.id)?.level || 0) > 0).length; if (nPrep < ci.prepared) out.push(`${ci.name}: prepare ${ci.prepared - nPrep} more spell(s)`); }
  }
  return out;
}

// ------------------------------------------------------------------ note body migration
// Older notes kept "## Biography" and "## Notes" as markdown sections under the sheet. They now live
// in the sheet's Biography & Diary box: return their text and the note with those sections removed.
export function extractLegacySections(note: string): { biography: string; diary: string; text: string } | null {
  const lines = note.split(/\r?\n/);
  let start = 0;
  if (lines[0] === "---") { const end = lines.indexOf("---", 1); if (end > 0) start = end + 1; }
  const found: Record<string, string> = {};
  const keep: string[] = lines.slice(0, start);
  let current: string | null = null, buf: string[] = [];
  const flush = () => { if (current) found[current] = buf.join("\n").trim(); current = null; buf = []; };
  for (const line of lines.slice(start)) {
    const h = line.match(/^##\s+(Biography|Notes)\s*$/i);
    if (h) { flush(); current = h[1].toLowerCase(); continue; }
    if (current && /^#{1,2}\s/.test(line)) flush(); // another section starts: stop capturing
    if (current) buf.push(line); else keep.push(line);
  }
  flush();
  if (!("biography" in found) && !("notes" in found)) return null;
  const text = keep.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
  return { biography: found.biography || "", diary: found.notes || "", text };
}
