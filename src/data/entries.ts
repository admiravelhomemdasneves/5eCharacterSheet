// The entries of imported data one by one, for the "Import data" settings page: which file each came
// from, removing some (and keeping them out of later imports), and the key of each one's compendium note.
import { ENTRY_KINDS, type EntryKind } from "./build.ts";
import { countData, type Counts } from "./report.ts";
import { sourceTag } from "./links.ts";
import type { Compendium } from "../rules/engine.ts";
import { lc } from "../text.ts";

/** One entry of the data: subraces are named "Race (Subrace)" and subclasses "Subclass (Class)", as in the import report. */
export interface DataEntry {
  kind: EntryKind;
  name: string;
  source: string;
  /** what identifies it across imports (see entryKey) */
  key: string;
  /** what identifies its compendium note (see noteKey) */
  noteKey: string;
  /** its compendium note now, if any */
  link: string | null;
}

/** Identifies an entry across imports: kind, name and source, lowercased. */
export const entryKey = (kind: EntryKind, name: string, source: string) => `${kind}|${lc(name)}|${lc(source)}`;
/** An entry removed from the imported data, as it is kept in the settings. */
export interface RemovedEntry { kind: EntryKind; name: string; source: string }
export const removedKeys = (list: RemovedEntry[]) => new Set(list.map((e) => entryKey(e.kind, e.name, e.source)));

/** The compendium folder of each kind of entry (subraces are notes of races, subclasses of classes). */
export const NOTE_KIND: Record<EntryKind, string> = {
  race: "races", subrace: "races", class: "classes", subclass: "classes", background: "backgrounds", feat: "feats", spell: "spells", item: "items",
};
/** Identifies an entry's compendium note, as the Linker looks it up: note kind, the name the note has, source. */
export const noteKey = (noteKind: string, name: string, source: string) => `${noteKind}|${lc(name)}|${sourceTag(source)}`;

/** Every entry of the data, in kind order. */
export function listEntries(d: Compendium): DataEntry[] {
  const out: DataEntry[] = [];
  // `noteName`: the name the Linker looks the note up by (a subrace's note is "Race (Subrace)", a subclass's its own name)
  const add = (kind: EntryKind, name: string, x: { source: string; link: string | null }, noteName = name) =>
    out.push({ kind, name, source: x.source, key: entryKey(kind, name, x.source), noteKey: noteKey(NOTE_KIND[kind], noteName, x.source), link: x.link });
  for (const r of d.races) add("race", r.name, r);
  for (const r of d.races) for (const s of r.subraces) add("subrace", `${r.name} (${s.name})`, s);
  for (const c of d.classes) add("class", c.name, c);
  for (const c of d.classes) for (const s of c.subclasses) add("subclass", `${s.name} (${c.name})`, s, s.name);
  for (const x of d.backgrounds) add("background", x.name, x);
  for (const x of d.feats) add("feat", x.name, x);
  for (const x of d.spells) add("spell", x.name, x);
  for (const x of d.items) add("item", x.name, x);
  return out;
}

/** The data without the entries whose keys are in `removed`; removing a race or class removes its subraces or subclasses. */
export function withoutEntries(d: Compendium, removed: ReadonlySet<string>): Compendium {
  if (!removed.size) return d;
  const keep = (kind: EntryKind, name: string, source: string) => !removed.has(entryKey(kind, name, source));
  return {
    ...d,
    races: d.races.filter((r) => keep("race", r.name, r.source))
      .map((r) => ({ ...r, subraces: r.subraces.filter((s) => keep("subrace", `${r.name} (${s.name})`, s.source)) })),
    classes: d.classes.filter((c) => keep("class", c.name, c.source))
      .map((c) => ({ ...c, subclasses: c.subclasses.filter((s) => keep("subclass", `${s.name} (${c.name})`, s.source)) })),
    backgrounds: d.backgrounds.filter((x) => keep("background", x.name, x.source)),
    feats: d.feats.filter((x) => keep("feat", x.name, x.source)),
    spells: d.spells.filter((x) => keep("spell", x.name, x.source)),
    items: d.items.filter((x) => keep("item", x.name, x.source)),
  };
}

/** The entries by where they came from: the 5etools data (file null) first, then each homebrew file by path. */
export interface EntryGroup { file: string | null; entries: DataEntry[]; counts: Counts }
export function groupByFile(d: Compendium, origins: Record<string, string> = {}): { groups: EntryGroup[]; total: Counts } {
  const groups = new Map<string | null, DataEntry[]>([[null, []]]);
  for (const e of listEntries(d)) {
    const file = origins[e.key] ?? null;
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file)!.push(e);
  }
  const counts = (entries: DataEntry[]) => {
    const c = Object.fromEntries(ENTRY_KINDS.map((k) => [k, 0])) as Counts;
    for (const e of entries) c[e.kind]++;
    return c;
  };
  const order = [...groups].sort(([a], [b]) => (a == null ? -1 : b == null ? 1 : a.localeCompare(b)));
  return { groups: order.map(([file, entries]) => ({ file, entries, counts: counts(entries) })), total: countData(d) };
}
