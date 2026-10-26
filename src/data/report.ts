// The report shown after an import: what came from the 5etools data folder and from each homebrew
// file, by kind, and for each homebrew file what it had that was left out (and why) or that the
// sheet does not use (monsters, optional features, …).
import { ENTRY_KINDS, type BrewEntry, type EntryKind } from "./build.ts";
import { homebrewSources } from "./detect.ts";
import { HOMEBREW_COLLECTIONS } from "./fivetools.ts";
import type { Compendium } from "../rules/engine.ts";

export type Counts = Record<EntryKind, number>;
/** A homebrew file of the import: `json` once read, `error` when it could not be read. */
export interface ReportFile { file: string; json?: unknown; error?: string }
export interface FileReport {
  file: string;
  /** the book names in its `_meta` */
  books: string[];
  /** why the file could not be read (then nothing came from it), else null */
  error: string | null;
  imported: Counts;
  leftOut: number;
  /** its entries the sheet uses, imported or not, by kind and name */
  entries: BrewEntry[];
  /** its collections the sheet does not use, with how many entries each */
  unused: { collection: string; count: number }[];
  /** what the import said about this file */
  messages: string[];
}
export interface ImportReport {
  /** null when only homebrew was imported */
  dataFolder: string | null;
  /** what came from the 5etools data folder */
  official: Counts;
  files: FileReport[];
  total: Counts;
  /** what the import said that is not about one file */
  messages: string[];
}

const zero = (): Counts => Object.fromEntries(ENTRY_KINDS.map((k) => [k, 0])) as Counts;

/** How many entries of each kind the data has. */
export function countData(d: Pick<Compendium, "races" | "classes" | "backgrounds" | "feats" | "spells" | "items">): Counts {
  return {
    race: d.races.length, subrace: d.races.reduce((a, r) => a + r.subraces.length, 0),
    class: d.classes.length, subclass: d.classes.reduce((a, c) => a + c.subclasses.length, 0),
    background: d.backgrounds.length, feat: d.feats.length, spell: d.spells.length, item: d.items.length,
  };
}

/** Collections of a homebrew file that the sheet does not read (`_meta`, `$schema` and the like are not collections). */
function unusedCollections(json: unknown) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const used = new Set<string>(HOMEBREW_COLLECTIONS);
  return Object.entries(json as Record<string, unknown>)
    .filter(([k, v]) => !used.has(k) && !/^[_$]/.test(k) && Array.isArray(v) && v.length)
    .map(([collection, v]) => ({ collection, count: (v as unknown[]).length }));
}

export function importReport(o: { data: Compendium; dataFolder: string | null; files: ReportFile[]; entries: BrewEntry[]; messages: string[] }): ImportReport {
  const total = countData(o.data);
  const order = (e: BrewEntry) => ENTRY_KINDS.indexOf(e.kind);
  const files = o.files.map(({ file, json, error }): FileReport => {
    const entries = o.entries.filter((e) => e.file === file).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    const imported = zero();
    for (const e of entries) if (e.reason == null) imported[e.kind]++;
    return {
      file, books: homebrewSources(json) ?? [], error: error ?? null, imported,
      leftOut: entries.filter((e) => e.reason != null).length, entries,
      unused: unusedCollections(json),
      messages: o.messages.filter((m) => m.startsWith(`${file}: `)).map((m) => m.slice(file.length + 2)),
    };
  });
  // the rest of the data is official (homebrew entries are added, never merged into official ones)
  const official = zero();
  for (const k of ENTRY_KINDS) official[k] = Math.max(0, total[k] - files.reduce((a, f) => a + f.imported[k], 0));
  const own = new Set(o.files.map((f) => `${f.file}: `));
  return { dataFolder: o.dataFolder, official, files, total, messages: o.messages.filter((m) => ![...own].some((p) => m.startsWith(p))) };
}
