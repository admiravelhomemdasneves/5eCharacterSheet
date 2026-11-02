// Custom data: the entries a player makes (races, classes, feats, spells, items…) and the file they are
// kept in. Nothing here knows the rules: what an entry's `data` holds is up to its kind, which the
// ruleset defines (src/custom/schema.ts, src/rules/5e-2014/custom.ts).
import { lc } from "../text.ts";

/** The source of custom entries in the rules data: menus group and label them by it. */
export const CUSTOM_SOURCE = "Custom";
/** The ruleset of data and entries that don't name one. */
export const DEFAULT_RULESET = "5e-2014";

/**
 * One entry. `id`: what sheets keep, made when the entry is created and never changed (renaming the
 * entry keeps the characters that use it). `ruleset`: the rules it is for; only the entries of the
 * rules the data is for are used. `kind`: one of its ruleset's kinds. `link`: a note it links to.
 */
export interface CustomEntry { id: string; ruleset: string; kind: string; name: string; link?: string; data: Record<string, unknown>; updated?: string }
export interface CustomFile { version: 1; entries: CustomEntry[] }
export const emptyCustomFile = (): CustomFile => ({ version: 1, entries: [] });

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/**
 * A custom data file as read (edited by hand, or by an older version): entries without a kind or name
 * are left out, other fields filled in. `warnings`: what was left out or repaired.
 */
export function normalizeCustomFile(raw: unknown): { file: CustomFile; warnings: string[] } {
  const warnings: string[] = [];
  const list: unknown[] = isObject(raw) && Array.isArray(raw.entries) ? raw.entries : [];
  if (raw != null && !(isObject(raw) && Array.isArray(raw.entries))) warnings.push("The file has no list of entries; it is read as empty.");
  const entries: CustomEntry[] = [];
  const ids = new Set<string>();
  list.forEach((x, i) => {
    if (!isObject(x) || typeof x.kind !== "string" || !x.kind || typeof x.name !== "string" || !x.name.trim()) {
      warnings.push(`Entry ${i + 1} has no kind or name, so it is left out.`);
      return;
    }
    const name = x.name.trim();
    let id = typeof x.id === "string" && x.id ? x.id : "";
    if (!id || ids.has(id)) {
      if (id) warnings.push(`${name}: its id is the same as another entry's, so it was given a new one.`);
      id = newEntryId(name, ids);
    }
    ids.add(id);
    entries.push({
      id, ruleset: typeof x.ruleset === "string" && x.ruleset ? x.ruleset : DEFAULT_RULESET, kind: x.kind, name,
      ...(typeof x.link === "string" && x.link ? { link: x.link } : {}),
      data: isObject(x.data) ? x.data : {},
      ...(typeof x.updated === "string" ? { updated: x.updated } : {}),
    });
  });
  return { file: { version: 1, entries }, warnings };
}

/** An id for a new entry, as the rules data makes them ("name|custom"), unlike any in `taken`. */
export function newEntryId(name: string, taken: ReadonlySet<string>) {
  const slug = lc(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entry";
  const tail = `|${lc(CUSTOM_SOURCE)}`;
  let id = slug + tail;
  for (let n = 2; taken.has(id); n++) id = `${slug}-${n}${tail}`;
  return id;
}
