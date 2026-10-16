// Dice formulas and the built-in roller. Pure (no Obsidian imports) so it can be unit tested in Node.
// Uses the same syntax as the Dice Roller plugin ("2d20kh1" = roll 2d20, keep highest 1).

export type RollMode = "normal" | "adv" | "dis";

// Advantage/disadvantage only applies to d20 rolls: 1d20+5 -> 2d20kh1+5 / 2d20kl1+5
export function withAdvantage(formula: string, mode: RollMode) {
  if (mode === "normal" || !/^1d20(?![\d])/i.test(formula.trim())) return formula;
  return formula.trim().replace(/^1d20/i, mode === "adv" ? "2d20kh1" : "2d20kl1");
}
export const isD20 = (formula: string) => /^1d20(?![\d])/i.test(formula.trim());

export function builtInRoll(formula: string, rand: () => number = Math.random) {
  const parts = formula.replace(/\s+/g, "").match(/[+-]?[^+-]+/g) || [];
  let total = 0;
  const shown: string[] = [];
  for (const p of parts) {
    const sign = p.startsWith("-") ? -1 : 1;
    const body = p.replace(/^[+-]/, "");
    const m = body.match(/^(\d*)d(\d+)(?:k([hl])(\d+))?$/i);
    if (m) {
      const n = parseInt(m[1] || "1"), faces = parseInt(m[2]);
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(rand() * faces));
      // indices of the dice that count (all of them unless kh/kl is used)
      let kept = rolls.map((_, i) => i);
      if (m[3]) {
        const keep = Math.min(n, parseInt(m[4]));
        const order = rolls.map((v, i) => ({ v, i })).sort((a, b) => (m[3].toLowerCase() === "h" ? b.v - a.v : a.v - b.v));
        kept = order.slice(0, keep).map((x) => x.i);
      }
      total += sign * kept.reduce((a, i) => a + rolls[i], 0);
      shown.push(`${sign < 0 ? "−" : ""}[${rolls.map((v, i) => (kept.includes(i) ? String(v) : `(${v})`)).join(", ")}]`);
    } else {
      const v = parseInt(body) || 0;
      total += sign * v;
      shown.push(`${sign < 0 ? "−" : "+"}${v}`);
    }
  }
  return { total, detail: shown.join(" ") };
}
