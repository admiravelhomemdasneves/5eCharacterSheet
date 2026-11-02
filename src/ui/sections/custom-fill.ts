// Manual mode: a button that fills a section's free text from the player's custom entries (Custom
// data), e.g. a custom spell added to the typed spell list. Shown only when there are entries for it.
import type { CustomEntry } from "../../custom/format";
import { button, Picker } from "../widgets";
import type { CharacterSheet } from "../sheet";

/** `section`: the ManualFill section of the kinds it offers (src/custom/schema.ts) */
export function fromCustom(sheet: CharacterSheet, parent: HTMLElement, section: string) {
  const { plugin } = sheet;
  if (!sheet.manual) return;
  const kinds = plugin.ruleset.kinds.filter((k) => k.manual?.section === section);
  const entries = plugin.customFile.entries.filter((e) => e.ruleset === plugin.ruleset.id && kinds.some((k) => k.kind === e.kind)).sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.length) return;
  const kindOf = (e: CustomEntry) => kinds.find((k) => k.kind === e.kind)!;
  button(parent, "From custom data…", () => new Picker(sheet.app, entries, (e) => e.name, (e) => sheet.change((x) => { kindOf(e).manual!.fill(e, x); }),
    `Search your custom ${kinds.map((k) => k.manual!.label).join(" or ")} entries…`, (e) => [kindOf(e).label[0], kindOf(e).summary?.(e)].filter(Boolean).join(" · ")).open(), "dnd-small");
}
