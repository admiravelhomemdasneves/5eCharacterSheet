// Conflicts between the rules a sheet or a vault uses and the data there is for them. One list, so the
// sheet, the settings and the notices all say the same. Nothing here needs Obsidian.
import type { ContextStatus } from "./context.ts";

export type ConflictKind = "unknown-rules" | "no-data" | "unresolved-entries" | "mixed-data" | "default-without-data";
export interface RulesConflict { kind: ConflictKind; message: string }

export interface SheetConflictInput {
  /** the rules of the sheet */
  ruleset: string;
  /** their name, or null when this version of the plugin doesn't have them */
  label: string | null;
  status: ContextStatus;
  /** the ids the sheet holds that its rules data doesn't have */
  unresolved: string[];
}

/** What is wrong between a sheet and its rules. Nothing is changed in the sheet while any of these holds. */
export function sheetConflicts(i: SheetConflictInput): RulesConflict[] {
  if (i.label === null) return [{ kind: "unknown-rules", message: `This sheet uses rules this version of the plugin doesn't know (${i.ruleset}). It is shown as far as possible and nothing in it is lost: update the plugin to use it.` }];
  if (i.status === "unavailable") return [{ kind: "no-data", message: `The rules data for ${i.label} could not be loaded, so this sheet is shown without it. Nothing in it is lost. Check the plugin settings.` }];
  if (i.status === "ready" && i.unresolved.length) {
    const n = i.unresolved.length;
    return [{ kind: "unresolved-entries", message: `${n} choice${n === 1 ? "" : "s"} on this sheet (${i.unresolved.join(", ")}) ${n === 1 ? "is" : "are"} not in the rules data for ${i.label}. Until ${n === 1 ? "it is" : "they are"} back or chosen again, its hit points and properties are left as they are.` }];
  }
  return [];
}

export interface DataConflictInput {
  /** the rules there are, each with its data */
  rules: { id: string; label: string; source: string; status: ContextStatus }[];
  /** the rules of new characters */
  defaultRuleset: string;
  /** the imported data has both editions in it */
  mixed: boolean;
}
/** What is wrong between the rules chosen and the data there is for them, for the settings. */
export function dataConflicts(i: DataConflictInput): RulesConflict[] {
  const out: RulesConflict[] = [];
  if (i.mixed) out.push({ kind: "mixed-data", message: "Your imported data has the 2014 and 2024 rules mixed, and all of it works by the 2014 rules: spells and classes of both show up together. Separate the editions so each has its own data. A sheet using 2024 entries can then be changed to the 2024 rules." });
  for (const r of i.rules) if (r.status === "unavailable") out.push({ kind: "no-data", message: `The rules data for ${r.label} could not be loaded: sheets using these rules keep what they hold, but show it without their rules. Import it, or choose another data source.` });
  const main = i.rules.find((r) => r.id === i.defaultRuleset);
  if (main?.source === "none" && i.rules.some((r) => r.source !== "none")) out.push({ kind: "default-without-data", message: `New characters use ${main.label}, which has no rules data, so they start in manual mode.` });
  return out;
}
