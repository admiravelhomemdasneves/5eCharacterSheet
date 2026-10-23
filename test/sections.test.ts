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
  assert.deepEqual(E.newCharacter().ui, { hidden: {} });
  const old = E.normalize({ name: "Old", ui: { collapsed: { skills: true }, sourceFilter: [], editing: {} } as any });
  // the view and the unused source filter leave older notes
  assert.deepEqual(old.ui, { hidden: {} });
  const s = E.normalize({ name: "Hid", ui: { collapsed: {}, editing: {}, hidden: { spells: true } } } as any);
  assert.deepEqual(s.ui, { hidden: { spells: true } });
});

test("the view of older notes is carried over once; newer notes don't keep one", () => {
  const old: any = { name: "Old", ui: { collapsed: { skills: true }, editing: { abilities: true }, hidden: {} } };
  assert.deepEqual(E.legacyView(old), { collapsed: { skills: true }, editing: { abilities: true } });
  assert.equal(E.legacyView({ name: "Old", ui: { hidden: {} } } as any), null);
  assert.equal(E.legacyView({ ...old, version: 2 }), null);
  assert.equal(E.legacyView(null), null);
});
