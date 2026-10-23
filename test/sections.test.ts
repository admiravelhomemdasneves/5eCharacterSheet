import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as E from "../src/rules/engine.ts";
import { SECTIONS } from "../src/sections.ts";
import { ROOT } from "./helpers.ts";

test("every section in the Sheet template exists on the sheet", () => {
  const dir = path.join(ROOT, "src", "ui", "sections");
  const code = [path.join(ROOT, "src", "ui", "sheet.ts"), ...fs.readdirSync(dir).map((f) => path.join(dir, f))].map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const keys = new Set([...code.matchAll(/(?:this|sheet)\.section\(\s*root,\s*"([a-z-]+)"/g)].map((m) => m[1]));
  for (const s of SECTIONS) assert.ok(keys.has(s.key), `no section "${s.key}" on the sheet`);
  assert.equal(new Set(SECTIONS.map((s) => s.key)).size, SECTIONS.length, "duplicate section keys");
});

test("hidden sections: new and older saved sheets show every section", () => {
  assert.deepEqual(E.newCharacter().ui.hidden, {});
  const old = E.normalize({ name: "Old", ui: { collapsed: { skills: true }, sourceFilter: [], editing: {} } as any });
  assert.deepEqual(old.ui.hidden, {});
  assert.equal(old.ui.collapsed.skills, true);
  const s = E.normalize({ name: "Hid", ui: { collapsed: {}, sourceFilter: [], editing: {}, hidden: { spells: true } } });
  assert.deepEqual(s.ui.hidden, { spells: true });
});
