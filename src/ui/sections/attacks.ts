// Attacks: the equipped weapons' attack and damage rolls.
import * as E from "../../rules/engine";
import { fmtMod } from "../../rules/engine";
import { d20 } from "../dice";
import type { CharacterSheet } from "../sheet";

export function attacks(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const atk = d.attacks;
  sheet.section(root, "attacks", "Attacks", (el) => {
    if (!atk.length) {
      // shown even when empty (Sheet template); manual mode has no item data to list weapons from
      el.createDiv({ cls: "dnd-hint", text: sheet.manual
        ? "Attacks are listed from equipped weapons when rules data is set (Settings → Rules data). Spell attacks are in Spellcasting."
        : "Equip weapons in the Inventory to list attacks here. Spell attacks are in Spellcasting." });
      return;
    }
    const t = el.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table" });
    const h = t.createEl("tr"); ["Weapon", "To Hit", "Damage", "Notes"].forEach((x) => h.createEl("th", { text: x }));
    for (const a of atk) {
      const tr = t.createEl("tr");
      sheet.link(tr.createEl("td"), a.name, a.link);
      sheet.rollable(tr.createEl("td"), fmtMod(a.toHit), d20(a.toHit), `${a.name} attack`);
      const dmgCell = tr.createEl("td");
      const formula = a.damage.split(" ")[0];
      sheet.rollable(dmgCell, a.damage, formula, `${a.name} damage`);
      tr.createEl("td", { text: a.notes });
    }
  });
}
