import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyDetected, detect, folderOptions, homebrewFolders, homebrewSources, vaultPath, type DetectFs, type Detected } from "../src/data/detect.ts";

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
  } finally { v.done(); }
});

test("detect: a folder with races.json but no class index is not 5etools data", async () => {
  const v = vault({ "Stuff/races.json": "{}", "Stuff/backgrounds.json": "{}", "Stuff/class/readme.md": "", "a.json": brew("A"), "b.json": brew("B") });
  try {
    const found = await detect(v.io);
    assert.deepEqual(found.dataFolders, []);
    assert.equal(found.homebrew.length, 2);
  } finally { v.done(); }
});

test("detect: every JSON file is read, however many there are", async () => {
  // like a whole homebrew repository: files far down the path order are found too
  const files: Record<string, string> = {};
  for (let i = 0; i < 700; i++) files[`homebrew/adventure/${String(i).padStart(3, "0")}.json`] = JSON.stringify({ adventure: [] });
  files["homebrew/collection/Grim Hollow.json"] = brew("Grim Hollow");
  const v = vault(files);
  try {
    assert.deepEqual((await detect(v.io)).homebrew.map((h) => h.path), ["homebrew/collection/Grim Hollow.json"]);
  } finally { v.done(); }
});

test("homebrew sources: book names from _meta.sources, null for other JSON", () => {
  assert.deepEqual(homebrewSources({ _meta: { sources: [{ full: "Grim Hollow", json: "GH" }, { json: "Extra" }] } }), ["Grim Hollow", "Extra"]);
  assert.equal(homebrewSources({ _meta: { sources: [] } }), null);
  assert.equal(homebrewSources({ race: [] }), null);
  assert.equal(homebrewSources(null), null);
});

test("vault paths: forward slashes, none doubled or at the ends", () => {
  assert.equal(vaultPath(" .5etools\\data/ "), ".5etools/data");
  assert.equal(vaultPath("/a//b/"), "a/b");
  assert.equal(vaultPath(""), "");
});

test("folder options: the set folder is checked, and listed when the scan missed it", () => {
  assert.deepEqual(folderOptions(["a", "b"], "b\\"), { options: ["a", "b"], current: "b", initial: "b" });
  assert.deepEqual(folderOptions(["a"], "old"), { options: ["a", "old"], current: "old", initial: "old" });
  assert.deepEqual(folderOptions(["a", "b"], ""), { options: ["a", "b"], current: "", initial: "a" });
  assert.deepEqual(folderOptions([], ""), { options: [], current: "", initial: null });
});

test("homebrew grouped by folder, in the order found", () => {
  const g = homebrewFolders([{ path: "x/A.json", sources: [] }, { path: "y/B.json", sources: [] }, { path: "x/C.json", sources: [] }, { path: "D.json", sources: [] }]);
  assert.deepEqual(g.map((x) => [x.folder, x.files.map((f) => f.path)]), [["x", ["x/A.json", "x/C.json"]], ["y", ["y/B.json"]], ["", ["D.json"]]]);
});

test("apply detected: unchecked folders are cleared; the homebrew list keeps its order", () => {
  const found: Detected = { dataFolders: ["d"], compendiums: ["c"], homebrew: ["h/1.json", "h/2.json", "h/3.json"].map((path) => ({ path, sources: [] })) };
  const cur = { fivetoolsPath: "d", compendiumFolder: "c", homebrewFiles: ["h\\2.json", "manual/x.json", "h/1.json"] };
  assert.deepEqual(applyDetected(cur, found, { data: null, compendium: "c", homebrew: new Set(["h/1.json", "h/3.json"]) }), {
    fivetoolsPath: "", compendiumFolder: "c",
    // h/2 unchecked leaves, the hand-listed file stays, h/1 keeps its place, h/3 is new and goes last
    homebrewFiles: ["manual/x.json", "h/1.json", "h/3.json"],
  });
  assert.deepEqual(applyDetected(cur, found, { data: "d", compendium: null, homebrew: new Set() }).homebrewFiles, ["manual/x.json"]);
});
