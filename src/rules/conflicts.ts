// Conflicts between the rules a sheet or a vault uses and the data there is for them. One list, so the
// sheet, the settings and the notices all say the same. Nothing here needs Obsidian.
import type { ContextStatus } from "./context.ts";

export type ConflictKind = "unknown-rules" | "no-data" | "unresolved-entries";
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
