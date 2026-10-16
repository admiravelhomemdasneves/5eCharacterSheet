import { test } from "node:test";
import assert from "node:assert/strict";
import { builtInRoll, withAdvantage } from "../src/rules/roll.ts";

test("advantage/disadvantage only changes d20 rolls", () => {
  assert.equal(withAdvantage("1d20+5", "adv"), "2d20kh1+5");
  assert.equal(withAdvantage("1d20-1", "dis"), "2d20kl1-1");
  assert.equal(withAdvantage("1d20", "adv"), "2d20kh1");
  assert.equal(withAdvantage("1d8+3", "adv"), "1d8+3");
  assert.equal(withAdvantage("1d200", "adv"), "1d200");
  assert.equal(withAdvantage("1d20+5", "normal"), "1d20+5");
});

test("2d20kh1 keeps the higher die, 2d20kl1 the lower", () => {
  for (let i = 0; i < 200; i++) {
    for (const [f, pick] of [["2d20kh1", Math.max], ["2d20kl1", Math.min]] as const) {
      const r = builtInRoll(f);
      const dice = (r.detail.match(/\d+/g) || []).map(Number);
      assert.equal(dice.length, 2);
      assert.ok(r.total >= 1 && r.total <= 20);
      assert.equal(r.total, pick(dice[0], dice[1]));
    }
  }
});

test("plain formulas stay in range", () => {
  for (let i = 0; i < 200; i++) {
    const r = builtInRoll("1d6+2");
    assert.ok(r.total >= 3 && r.total <= 8, `${r.total}`);
  }
  assert.equal(builtInRoll("2d6-1", () => 0).total, 1); // both dice roll 1
});
