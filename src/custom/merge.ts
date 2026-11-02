// Custom entries into the rules data: the data with them added, as the engine reads it, so a custom
// feat or spell works like an imported one.
import type { Compendium } from "../rules/engine.ts";
import { noteKey } from "../data/entries.ts";
import { CUSTOM_SOURCE, DEFAULT_RULESET, type CustomFile } from "./format.ts";
import type { KindDef, Ruleset } from "./schema.ts";

/** The ruleset some rules data is for (data from before rulesets is for the 2014 rules). */
export const rulesetOf = (d: Compendium) => d.meta.ruleset ?? DEFAULT_RULESET;

/**
 * `base` with the entries of `file` that are for `ruleset`, by the order of its kinds (so an entry
 * that belongs to another comes after it). `base` is not changed: the lists are copied.
 * `warnings`: entries that could not be added; `links`: the notes entries link to, by noteKey (for
 * the Linker, as notes chosen for them); `other`: how many entries are for other rules.
 */
export function mergeCustom(base: Compendium, file: CustomFile, ruleset: Ruleset) {
  const data: Compendium = {
    ...base, meta: { ...base.meta, sources: { ...base.meta.sources, [CUSTOM_SOURCE]: "Custom data" } },
    races: [...base.races], classes: [...base.classes], backgrounds: [...base.backgrounds], feats: [...base.feats], spells: [...base.spells], items: [...base.items],
  };
  const warnings: string[] = [], links: Record<string, string> = {};
  const mine = file.entries.filter((e) => e.ruleset === ruleset.id);
  const kinds = new Map<string, KindDef>(ruleset.kinds.map((k) => [k.kind, k]));
  for (const def of ruleset.kinds) for (const e of mine.filter((x) => x.kind === def.kind)) {
    const problem = def.apply(e, data);
    if (problem) { warnings.push(`${e.name} (${def.label[0]}): ${problem}`); continue; }
    if (e.link) links[noteKey(def.noteKind, e.name, CUSTOM_SOURCE)] = e.link;
  }
  for (const e of mine) if (!kinds.has(e.kind)) warnings.push(`${e.name}: "${e.kind}" is not a kind of entry of these rules, so it is left out.`);
  return { data, warnings, links, other: file.entries.length - mine.length };
}
