// What a sheet needs from the plugin to work with its rules: the plugin keeps one of these per ruleset,
// and a sheet uses the one of the rules it was made with. Nothing here needs Obsidian.
import type { Ruleset } from "../custom/schema.ts";
import { Linker } from "../data/links.ts";
import { Rules, type Compendium } from "./engine.ts";

export const EMPTY_DATA: Compendium = { meta: { sources: {} }, races: [], classes: [], backgrounds: [], feats: [], spells: [], items: [] };

/**
 * `ready`: what the rules say can be trusted (also in manual mode, when that was chosen).
 * `loading`: the data isn't there yet. `unavailable`: it could not be loaded, or the rules are unknown.
 * In the last two a sheet shows what it can, and nothing is worked out from the missing data.
 */
export type ContextStatus = "loading" | "ready" | "unavailable";

export interface RulesContext {
  /** the id of the rules, also when they are unknown */
  id: string;
  /** null: rules this version of the plugin doesn't have */
  ruleset: Ruleset | null;
  status: ContextStatus;
  rules: Rules;
  linker: Linker;
  /** the rules data without the custom entries (what "Import data" lists) */
  baseData: Compendium;
  /** the custom entries on their own, as rules data: what manual mode fills its fields from */
  customOnly: Compendium;
  /** no rules data configured (or the configured data could not be loaded); custom entries alone don't leave it */
  manual: boolean;
  /** what could not be read or added of the custom entries */
  customProblems: string[];
  /** how many custom entries are for other rules */
  customOther: number;
  /** the imported rules data was made by an older importer and should be imported again */
  importIsOutdated: boolean;
}

/** A context with no data, as when it hasn't loaded or can't be. */
export function emptyContext(id: string, ruleset: Ruleset | null, status: ContextStatus): RulesContext {
  return {
    id, ruleset, status, rules: new Rules(EMPTY_DATA), linker: new Linker(null, []), baseData: EMPTY_DATA, customOnly: EMPTY_DATA,
    manual: true, customProblems: [], customOther: 0, importIsOutdated: false,
  };
}
