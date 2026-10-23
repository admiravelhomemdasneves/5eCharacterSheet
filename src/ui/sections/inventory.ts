// Inventory & Coins.
import { Notice } from "obsidian";
import * as E from "../../rules/engine";
import { button, checkbox, iconButton, labeled, Picker, stepper } from "../widgets";
import { richText } from "../richtext";
import type { CharacterSheet } from "../sheet";

export function inventory(sheet: CharacterSheet, root: HTMLElement, d: E.Derived) {
  const s = sheet.v, r = sheet.r;
  sheet.section(root, "inventory", "Inventory & Coins", (el) => {
    const coins = el.createDiv({ cls: "dnd-grid-5 dnd-coins" });
    for (const c of ["cp", "sp", "ep", "gp", "pp"] as const) stepper(labeled(coins, c.toUpperCase()), s.coins[c], (v) => sheet.change((x) => { x.coins[c] = v; }), { min: 0 });
    const t = el.createDiv({ cls: "dnd-table-wrap" }).createEl("table", { cls: "dnd-table dnd-inv" });
    const h = t.createEl("tr"); ["Item", "Qty", "Weight", "Equipped", "Attuned", "Notes", ""].forEach((x) => h.createEl("th", { text: x }));
    const attuned = E.attunedCount(s);
    s.inventory.forEach((inv, i) => {
      const it = r.item(inv.id);
      const tr = t.createEl("tr");
      const nameTd = tr.createEl("td");
      if (it) sheet.link(nameTd, inv.name || it.name, it.link); else richText(sheet, nameTd, inv.name, (v) => sheet.change((x) => { x.inventory[i].name = v; }, false), { placeholder: "Item name", singleLine: true });
      if (it?.rarity) nameTd.createSpan({ cls: "dnd-tag", text: it.rarity });
      stepper(tr.createEl("td"), inv.qty, (v) => sheet.change((x) => { x.inventory[i].qty = v; }), { min: 0 });
      const w = tr.createEl("td");
      const wi = w.createEl("input", { type: "number", value: inv.weight == null ? "" : String(inv.weight), cls: "dnd-num" });
      wi.addEventListener("change", () => sheet.change((x) => { x.inventory[i].weight = wi.value === "" ? null : parseFloat(wi.value); }));
      const eq = tr.createEl("td");
      if (!it || it.kind !== "gear" || it.bonusAc) checkbox(eq, inv.equipped, (v) => sheet.change((x) => { x.inventory[i].equipped = v; }));
      const at = tr.createEl("td");
      if (!it || it.attunement) checkbox(at, inv.attuned, (v) => { if (v && attuned >= E.ATTUNEMENT_MAX) new Notice(`You can be attuned to at most ${E.ATTUNEMENT_MAX} items.`); sheet.change((x) => { x.inventory[i].attuned = v; }); });
      richText(sheet, tr.createEl("td"), inv.notes, (v) => sheet.change((x) => { x.inventory[i].notes = v; }, false), { placeholder: "—", singleLine: true });
      iconButton(tr.createEl("td"), "trash-2", "Remove", () => sheet.change((x) => { x.inventory.splice(i, 1); }));
    });
    const add = el.createDiv({ cls: "dnd-row" });
    if (r.data.items.length) button(add, "+ Add item from compendium", () => new Picker(sheet.app, r.data.items, (it) => `${it.name} (${it.source})`, (it) => sheet.change((x) => {
      x.inventory.push({ id: it.id, name: it.name, qty: 1, weight: it.weight, equipped: it.kind !== "gear", attuned: false, notes: "" });
    }), "Search items…", (it) => [it.kind, it.rarity, it.weight != null ? `${it.weight} lb.` : "", it.value != null ? `${it.value / 100} gp` : ""].filter(Boolean).join(" · ")).open());
    button(add, "+ Custom item", () => sheet.change((x) => { x.inventory.push({ id: null, name: "", qty: 1, weight: null, equipped: false, attuned: false, notes: "" }); }));
    const wt = E.inventoryWeight(s), cap = E.carryingCapacity(d.scores);
    el.createDiv({ cls: wt > cap ? "dnd-warn" : "dnd-hint", text: `Carried: ${Math.round(wt * 10) / 10} lb. / capacity ${cap} lb. · Attuned items: ${attuned}/${E.ATTUNEMENT_MAX}` });
  });
}
