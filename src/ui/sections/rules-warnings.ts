// What is wrong between this sheet and its rules (src/rules/conflicts.ts), above everything else on it.
import type { CharacterSheet } from "../sheet";

export function rulesWarnings(sheet: CharacterSheet, root: HTMLElement) {
  for (const c of sheet.conflicts()) root.createDiv({ cls: "dnd-rules-warning", text: c.message });
}
