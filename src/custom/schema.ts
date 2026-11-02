// What a ruleset says about custom entries: the kinds a player can make, the fields of each (the form
// is drawn from them, src/ui/custom-form.ts) and how an entry becomes rules data. The file, the
// settings page and the form only know these shapes, so another ruleset (D&D 2024) is one more
// Ruleset, not changes to them.
import type { CharState, Compendium } from "../rules/engine.ts";
import type { CustomEntry } from "./format.ts";

/** An option of a select field; `group`: the heading it is listed under. */
export interface Choice { value: string; label: string; group?: string }
/** What fields and kinds can look at: the rules data the entries go into (custom entries included). */
export interface CustomContext { data: Compendium }

/** `visible`: whether the field applies to an entry with this data (e.g. armour fields for armour only). */
/** `default`: a new entry's value (else an empty one, see emptyValue); `help`: a line under the label, which may depend on the entry's other values */
interface FieldBase { key: string; label: string; help?: string | ((data: Record<string, unknown>, ctx: CustomContext) => string); required?: boolean; default?: unknown; visible?: (data: Record<string, unknown>) => boolean }
/**
 * A field of a kind's form. text: one line; markdown: several lines of Markdown; number; checkbox;
 * select: one of `options`; multiselect: any of them (a list of values); list: rows of the fields `of`
 * (a list of objects), added with `addLabel`.
 */
export type FieldDef = FieldBase & (
  | { type: "text"; placeholder?: string }
  | { type: "markdown"; placeholder?: string }
  | { type: "number"; min?: number; max?: number; step?: number; placeholder?: string | ((data: Record<string, unknown>, ctx: CustomContext) => string) }
  | { type: "checkbox" }
  | { type: "select" | "multiselect"; options: Choice[] | ((ctx: CustomContext) => Choice[]) }
  | { type: "list"; of: FieldDef[]; addLabel: string }
);

/** Where a kind's entries can fill in manual mode (src/ui/sections/custom-fill.ts), and what picking one fills. */
export interface ManualFill { section: string; label: string; fill: (e: CustomEntry, s: CharState) => void }

export interface KindDef {
  kind: string;
  /** singular and plural, e.g. ["Feat", "Feats"] */
  label: [one: string, many: string];
  /** the compendium folder of its notes (as the Linker finds notes), e.g. "feats"; "": it has no note of its own */
  noteKind: string;
  /** the name its note has, when not its own (a subrace's note is "Race (Subrace)") */
  noteName?: (e: CustomEntry, data: Compendium) => string;
  /** the field that holds what it belongs to (a subrace's race): two entries of the kind may share a name if they belong to different ones */
  parentKey?: string;
  fields: FieldDef[];
  /** adds the entry (as `source` CUSTOM_SOURCE) to `data`, which is a copy it may change; a warning when it can't be */
  apply: (e: CustomEntry, data: Compendium) => string | null;
  /** a line about an entry for the list of entries, e.g. "1st-level evocation" */
  summary?: (e: CustomEntry) => string;
  manual?: ManualFill;
  /** why entries of this kind can't be made with this data (null: they can), e.g. no races to add a trait to */
  available?: (ctx: CustomContext) => string | null;
}
export interface Ruleset { id: string; label: string; kinds: KindDef[] }

/** The options of a select field for this context. */
export const choicesOf = (f: Extract<FieldDef, { options: unknown }>, ctx: CustomContext) => (typeof f.options === "function" ? f.options(ctx) : f.options);
/** The value of each field of a new entry: empty text, 0, unchecked, no picks, no rows. */
export function emptyData(fields: FieldDef[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f.key, emptyValue(f)]));
}
export function emptyValue(f: FieldDef): unknown {
  if (f.default !== undefined) return structuredClone(f.default);
  switch (f.type) {
    case "number": return f.min ?? 0;
    case "checkbox": return false;
    case "multiselect": case "list": return [];
    default: return "";
  }
}
/** The required fields (of those that apply) left empty, by label. */
export function missingFields(fields: FieldDef[], data: Record<string, unknown>): string[] {
  return fields.filter((f) => f.required && (!f.visible || f.visible(data))).filter((f) => {
    const v = data[f.key];
    return v == null || v === "" || (Array.isArray(v) && !v.length);
  }).map((f) => f.label);
}

// Reading an entry's data, which may have been edited by hand: a value of the wrong type is read as empty.
export const str = (d: Record<string, unknown>, k: string) => { const v = d[k]; return typeof v === "string" ? v : typeof v === "number" ? String(v) : ""; };
export const num = (d: Record<string, unknown>, k: string) => { const v = d[k]; return typeof v === "number" && Number.isFinite(v) ? v : parseFloat(str(d, k)) || 0; };
export const bool = (d: Record<string, unknown>, k: string) => d[k] === true;
export const strs = (d: Record<string, unknown>, k: string): string[] => { const v = d[k]; return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; };
export const rows = (d: Record<string, unknown>, k: string) =>
  (Array.isArray(d[k]) ? (d[k] as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : []);
/** "a, b; c" -> ["a", "b", "c"] */
export const commaList = (text: string) => text.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
