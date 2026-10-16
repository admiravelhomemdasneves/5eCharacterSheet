// Types for the parts of the 5etools data files that the sheet reads.
// Only the fields used by build.ts are described; everything is optional where 5etools omits it.

export type Abil = "str" | "dex" | "con" | "int" | "wis" | "cha";

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
  _copy?: { name: string; source: string };
}
export type RawSpeedValue = number | boolean | { number: number };
export type RawSpeed = number | Partial<Record<"walk" | "fly" | "swim" | "climb" | "burrow", RawSpeedValue>>;
export type RawAbility = Partial<Record<Abil, number>> & {
  choose?: { from: Abil[]; count?: number; amount?: number; weighted?: { from: Abil[]; weights: number[] } };
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
  proficiency?: Abil[];
  startingProficiencies?: { armor?: RawProfItem[]; weapons?: RawProfItem[]; tools?: RawProfItem[]; skills?: RawSkillChoice[] };
  casterProgression?: string;
  spellcastingAbility?: Abil;
  preparedSpells?: string;
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  spellsKnownProgressionFixed?: number[];
  classTableGroups?: RawTableGroup[];
  classFeatures?: RawClassFeatureRef[];
  subclassTitle?: string;
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
  subclassFeatures?: string[];
  casterProgression?: string;
  spellcastingAbility?: Abil;
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  additionalSpells?: RawAdditionalSpells[];
}
export interface RawSubclassFeature extends RawBase { subclassShortName: string; level: number }
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
  spellAttack?: string[];
  savingThrow?: string[];
  damageInflict?: string[];
  entriesHigherLevel?: RawEntry[];
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
