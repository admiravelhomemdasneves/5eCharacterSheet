import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detect, homebrewSources, type DetectFs } from "../src/data/detect.ts";

// A vault on disk, read the way the vault adapter does: vault paths, "" for the root
function vault(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "detect-"));
  for (const [p, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), text); }
  for (const d of ["Notes/compendium", "Notes/rules"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  const abs = (p: string) => path.join(root, p);
  const rel = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
  const io: DetectFs = {
    list: async (dir) => {
      const entries = fs.readdirSync(abs(dir), { withFileTypes: true });
      return { files: entries.filter((e) => e.isFile()).map((e) => rel(dir, e.name)), folders: entries.filter((e) => e.isDirectory()).map((e) => rel(dir, e.name)) };
    },
    read: async (p) => fs.readFileSync(abs(p), "utf8"),
    size: async (p) => fs.statSync(abs(p)).size,
  };
  return { io, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const brew = (full: string) => JSON.stringify({ _meta: { sources: [{ json: full.replace(/\W/g, ""), abbreviation: "X", full }] }, race: [] });

test("detect: 5etools data, homebrew and a compendium, hidden folders included", async () => {
  const v = vault({
    ".5etools/data/races.json": "{}", ".5etools/data/backgrounds.json": "{}", ".5etools/data/class/index.json": "{}",
    // official data files are not homebrew, even with a _meta
    ".5etools/data/class/class-wizard.json": JSON.stringify({ _meta: { sources: [{ json: "PHB" }] } }),
    ".5etools/homebrew/My Book.json": brew("My Book"),
    "Homebrew/Other.json": brew("Other Book"),
    "Notes/data.json": JSON.stringify({ _meta: { internalCopies: [] } }),
    "Notes/broken.json": "{ \"_meta\": ",
    ".obsidian/plugins/x/data.json": brew("Plugin data"),
    "Characters/Hero.md": "---\n---\n",
  });
  try {
    const found = await detect(v.io, { skip: [".obsidian"] });
    assert.deepEqual(found.dataFolders, [".5etools/data"]);
    assert.deepEqual(found.homebrew, [{ path: ".5etools/homebrew/My Book.json", sources: ["My Book"] }, { path: "Homebrew/Other.json", sources: ["Other Book"] }]);
    assert.deepEqual(found.compendiums, ["Notes"]);
    assert.equal(found.truncated, false);
  } finally { v.done(); }
});

test("detect: a folder with races.json but no class index is not 5etools data; reads are capped", async () => {
  const v = vault({ "Stuff/races.json": "{}", "Stuff/backgrounds.json": "{}", "Stuff/class/readme.md": "", "a.json": brew("A"), "b.json": brew("B") });
  try {
    // read in path order: Stuff/backgrounds.json, Stuff/races.json, a.json, then the cap
    const found = await detect(v.io, { maxReads: 3 });
    assert.deepEqual(found.dataFolders, []);
    assert.equal(found.homebrew.length, 1);
    assert.equal(found.truncated, true);
  } finally { v.done(); }
});

test("homebrew sources: book names from _meta.sources, null for other JSON", () => {
  assert.deepEqual(homebrewSources({ _meta: { sources: [{ full: "Grim Hollow", json: "GH" }, { json: "Extra" }] } }), ["Grim Hollow", "Extra"]);
  assert.equal(homebrewSources({ _meta: { sources: [] } }), null);
  assert.equal(homebrewSources({ race: [] }), null);
  assert.equal(homebrewSources(null), null);
});
