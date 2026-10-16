// Dice rolling: uses the Dice Roller plugin when installed, otherwise a small built-in roller.
import { App, Notice } from "obsidian";
import { builtInRoll } from "../rules/roll";

export async function roll(app: App, formula: string, label: string) {
  const dr = (app as any).plugins?.getPlugin?.("obsidian-dice-roller");
  const api = dr?.api ?? (window as any).DiceRoller;
  if (api?.getRoller) {
    try {
      const roller = await api.getRoller(formula, "dnd-character-sheet");
      await roller.roll();
      const result = roller.result ?? roller.resultText;
      new Notice(`🎲 ${label}: ${result}\n${roller.resultText ?? formula}`, 6000);
      return;
    } catch (e) {
      console.warn("5e Character Sheet: Dice Roller failed, using built-in roller", e);
    }
  }
  const r = builtInRoll(formula);
  new Notice(`🎲 ${label}: ${r.total}\n${formula} → ${r.detail}`, 6000);
}

export const d20 = (bonus: number) => `1d20${bonus >= 0 ? "+" : ""}${bonus}`;
