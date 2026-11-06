// Which rules the data of a vault is for: what is imported for each, and data from before editions
// were kept apart. Nothing here needs Obsidian.
import { DEFAULT_RULESET } from "../custom/format.ts";
import type { Compendium } from "../rules/engine.ts";
import { SOURCES_2024 } from "./build.ts";

export const RULESET_2024_ID = "5e-2024";
type Sources = { dataSource: string; dataSource2024: string };

/** The rules "Import now" imports: each of those whose data source is the imported data. */
export const importedRulesets = (st: Sources) => [...st.dataSource === "imported" ? [DEFAULT_RULESET] : [], ...st.dataSource2024 === "imported" ? [RULESET_2024_ID] : []];

/** The compendium of some rules: the 2024 rules have their own folder if one is set, else they use the same one. */
export const compendiumFor = (st: { compendiumFolder: string; compendiumFolder2024: string }, ruleset: string) =>
  (ruleset === RULESET_2024_ID && st.compendiumFolder2024.trim()) || st.compendiumFolder.trim();

/** Editions are kept apart unless the import filter of an older version let them mix: then that stays until the player separates them. */
export const editionsApart = (saved: { splitEditions?: boolean; importRules2014?: boolean; importOnlyWithNotes?: boolean } | null | undefined) =>
  saved?.splitEditions ?? ((saved?.importRules2014 ?? true) && !saved?.importOnlyWithNotes);

/** Data imported with both editions in it: it says no rules, and has entries of the 2024 books. */
export function isMixedData(d: Compendium) {
  if (d.meta.ruleset) return false;
  return [d.races, d.classes, d.backgrounds, d.feats, d.spells, d.items].some((list) => list.some((x) => SOURCES_2024.has(x.source)));
}
