// Types for the parts of the 5etools data files that the sheet reads.
// Only the fields used by build.ts are described; everything is optional where 5etools omits it.

import type { Ability } from "../rules/engine.ts";

// ---------------------------------------------------------------- text entries
export type RawCell = string | number | RawEntryObject;
export interface RawEntryObject {
  type?: string;
  name?: string;
  entries?: RawEntry[];
  entry?: RawEntry;
  items?: RawEntry[];
  caption?: string;
  colLabels?: string[];
  rows?: (RawCell[] | { row: RawCell[] })[];
  attributes?: string[];
  roll?: { exact?: number; min?: number; max?: number };
}
export type RawEntry = string | RawEntryObject;

// ---------------------------------------------------------------- shared fields
export interface RawBase {
  name: string;
  source: string;
  srd?: boolean | string;
  edition?: string;
  entries?: RawEntry[];
  _copy?: RawCopy;
}
/**
 * "This entry is that one, changed": `name` and `source` (plus e.g. className for subclasses) say
 * what is copied, `_mod` how its fields change, `_preserve` which normally-skipped fields are kept.
 */
export type RawCopy = { name: string; source: string; _mod?: Record<string, RawMod | RawMod[]>; _preserve?: Record<string, boolean> } & Record<string, unknown>;
export type RawMod = string | {
  mode: string;
  items?: unknown;
  index?: number;
  replace?: string | { index?: number; regex?: string; flags?: string };
  with?: string;
  flags?: string;
  names?: string | string[];
};
export type RawSpeedValue = number | boolean | { number: number };
export type RawSpeed = number | Partial<Record<"walk" | "fly" | "swim" | "climb" | "burrow", RawSpeedValue>>;
export type RawAbility = Partial<Record<Ability, number>> & {
  choose?: { from: Ability[]; count?: number; amount?: number; weighted?: { from: Ability[]; weights: number[] } };
};
/** e.g. { history: true }, { any: 2 }, { choose: { from: [...], count: 2 } } */
export type RawProf = Record<string, boolean | number | { from: string[]; count?: number }>;
export type RawProfItem = string | { proficiency?: string; full?: string };
export interface RawSkillChoice { choose?: { from: string[]; count: number }; any?: number }
export interface RawAdditionalSpells {
  ability?: unknown;
  known?: Record<string, unknown>;
  prepared?: Record<string, unknown>;
  innate?: Record<string, unknown>;
  expanded?: Record<string, unknown>;
}

// ---------------------------------------------------------------- races
export interface RawRace extends RawBase {
  size?: string[];
  speed?: RawSpeed;
  ability?: RawAbility[];
  lineage?: string | boolean;
  darkvision?: number;
  skillProficiencies?: RawProf[];
  toolProficiencies?: RawProf[];
  weaponProficiencies?: RawProf[];
  armorProficiencies?: RawProf[];
  languageProficiencies?: RawProf[];
  resist?: unknown[];
  feats?: unknown;
  additionalSpells?: RawAdditionalSpells[];
}
export interface RawSubrace extends RawRace { raceName: string; raceSource: string; overwrite?: { ability?: boolean } }
export interface RacesFile { race: RawRace[]; subrace: RawSubrace[] }

// ---------------------------------------------------------------- classes
export type RawTableValue = string | number | { value?: number; toRoll?: { number: number; faces: number }[] };
export interface RawTableGroup { colLabels?: string[]; rows?: RawTableValue[][]; rowsSpellProgression?: number[][] }
export type RawClassFeatureRef = string | { classFeature: string; gainSubclassFeature?: boolean };
export interface RawClass extends RawBase {
  hd?: { faces: number };
  proficiency?: Ability[];
  startingProficiencies?: { armor?: RawProfItem[]; weapons?: RawProfItem[]; tools?: RawProfItem[]; skills?: RawSkillChoice[] };
  casterProgression?: string;
  spellcastingAbility?: Ability;
  preparedSpells?: string;
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  spellsKnownProgressionFixed?: number[];
  classTableGroups?: RawTableGroup[];
  classFeatures?: RawClassFeatureRef[];
  subclassTitle?: string;
  /** homebrew: the class's spell list, as "name|source" (PHB when left out) or { name, source } */
  classSpells?: (string | { name?: string; source?: string })[];
  multiclassing?: {
    requirements?: Record<string, unknown>;
    proficienciesGained?: { armor?: RawProfItem[]; weapons?: RawProfItem[]; skills?: RawSkillChoice[] };
  };
}
export interface RawClassFeature extends RawBase { className: string; level: number; isClassFeatureVariant?: boolean }
export interface RawSubclass extends RawBase {
  shortName: string;
  className: string;
  classSource: string;
  subclassFeatures?: (string | { subclassFeature?: string })[];
  casterProgression?: string;
  spellcastingAbility?: Ability;
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  additionalSpells?: RawAdditionalSpells[];
  /** homebrew: spells added to the class's list for this subclass only, written like classSpells */
  subclassSpells?: (string | { name?: string; source?: string })[];
}
export interface RawSubclassFeature extends RawBase { className: string; subclassShortName: string; level: number }
export interface ClassFile { class?: RawClass[]; subclass?: RawSubclass[]; classFeature?: RawClassFeature[]; subclassFeature?: RawSubclassFeature[] }

// ---------------------------------------------------------------- backgrounds, feats
export interface RawBackground extends RawBase {
  skillProficiencies?: RawProf[];
  toolProficiencies?: RawProf[];
  languageProficiencies?: RawProf[];
  feats?: unknown;
}
export interface RawFeat extends RawBase { prerequisite?: Record<string, unknown>[]; ability?: RawAbility[] }

// ---------------------------------------------------------------- spells
export interface RawSpell extends RawBase {
  level: number;
  school: string;
  time?: { number: number; unit: string }[];
  range?: { type: string; distance?: { type: string; amount?: number } };
  components?: { v?: boolean; s?: boolean; m?: string | { text: string } };
  duration?: { type: string; concentration?: boolean; duration?: { amount: number; type: string } }[];
  meta?: { ritual?: boolean };
  entriesHigherLevel?: RawEntry[];
  /** homebrew: class lists on the spell itself (official spells have them in spells/sources.json) */
  classes?: { fromClassList?: { name: string }[]; fromClassListVariant?: { name: string }[] };
}
export type SpellSourcesFile = Record<string, Record<string, { class?: { name: string }[]; classVariant?: { name: string }[] }>>;

// ---------------------------------------------------------------- items
export interface RawItem extends RawBase {
  type?: string;
  weapon?: boolean;
  weaponCategory?: string;
  ac?: number;
  strength?: string | number;
  stealth?: boolean;
  dmg1?: string;
  dmg2?: string;
  dmgType?: string;
  property?: (string | { uid?: string })[];
  range?: string;
  weight?: number;
  value?: number;
  rarity?: string;
  reqAttune?: boolean | string;
  bonusAc?: string;
  bonusWeapon?: string;
  baseItem?: string;
}

// ---------------------------------------------------------------- indexes and source names
export type FileIndex = Record<string, string>;
export interface BooksFile { book: { id: string; name: string }[] }
export interface AdventuresFile { adventure: { id: string; name: string }[] }

// ---------------------------------------------------------------- loaded data
/** The collections the importer reads, each gathered from all the files it is spread over. */
export interface RawData {
  race: RawRace[];
  subrace: RawSubrace[];
  class: RawClass[];
  classFeature: RawClassFeature[];
  subclass: RawSubclass[];
  subclassFeature: RawSubclassFeature[];
  background: RawBackground[];
  feat: RawFeat[];
  spell: RawSpell[];
  baseitem: RawItem[];
  item: RawItem[];
  /** spell class lists of official spells (spells/sources.json) */
  spellSources: SpellSourcesFile;
  /** source id -> book or adventure name */
  sourceNames: Record<string, string>;
}
/** Collections of RawData that a homebrew file can add to. */
export const HOMEBREW_COLLECTIONS = ["race", "subrace", "class", "classFeature", "subclass", "subclassFeature", "background", "feat", "spell", "baseitem", "item"] as const;
/** A 5etools homebrew file: `_meta.sources` names its books, the rest are collections like the official data's. */
export type HomebrewJson = {
  _meta?: {
    sources?: { json: string; full?: string; abbreviation?: string }[];
    /** sources this file builds on, per collection, e.g. { spell: ["llspell"] } */
    dependencies?: Record<string, unknown>;
  };
} & Partial<Record<string, unknown>>;
