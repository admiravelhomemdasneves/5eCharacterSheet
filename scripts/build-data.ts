// Builds sheet data from a 5etools data folder, using the same code as the plugin's importer.
//   node scripts/build-data.ts srd                 -> data/srd-5.1.json (bundled in the plugin)
//   node scripts/build-data.ts srd52               -> data/srd-5.2.1.json (bundled in the plugin)
//   node scripts/build-data.ts import [compendium] -> data/imported.json (personal, never committed)
// `import` keeps only entries that have a note in the compendium folder of a vault (VAULT and
// COMPENDIUM env vars, or local.config.json),
// which reproduces the menus of a ttrpg-convert-cli compendium.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildCompendium, summarize } from "../src/data/build.ts";
import { Linker } from "../src/data/links.ts";
import { SRD_521_ATTRIBUTION, SRD_ATTRIBUTION } from "../src/data/attribution.ts";
import { ROOT, compendiumNotes, personalPaths } from "./local.ts";

const DATA = process.env.FIVETOOLS_DATA || path.join(ROOT, "vendor", "5etools-data");
const read = async (rel: string) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const mode = process.argv[2] || "srd";
/** the 5etools commit the data comes from: FIVETOOLS_COMMIT, or the data folder's own git checkout */
function dataCommit() {
  if (process.env.FIVETOOLS_COMMIT) return process.env.FIVETOOLS_COMMIT;
  try { return execFileSync("git", ["-C", DATA, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return undefined; }
}

if (mode === "srd") {
  const data = await buildCompendium({ read, srdOnly: true, rules2014Only: true });
  const out = { ...data, meta: { ...data.meta, attribution: SRD_ATTRIBUTION, dataCommit: dataCommit() } };
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data", "srd-5.1.json"), JSON.stringify(out));
  console.log("SRD:", summarize(data));
} else if (mode === "srd52") {
  const data = await buildCompendium({ read, srdOnly: true, edition: "2024" });
  const out = { ...data, meta: { ...data.meta, attribution: SRD_521_ATTRIBUTION, dataCommit: dataCommit() } };
  fs.writeFileSync(path.join(ROOT, "data", "srd-5.2.1.json"), JSON.stringify(out));
  console.log("SRD 5.2.1:", summarize(data));
} else {
  const { vault, compendium } = personalPaths();
  const comp = process.argv[3] || compendium;
  if (!vault || !comp) throw new Error("Set VAULT and COMPENDIUM (or create local.config.json with { \"vault\", \"compendium\" }).");
  const notes = compendiumNotes(vault, comp);
  const linker = new Linker(comp, notes);
  // the compendium already decides what is in (it was generated with 2014 sources), so no edition filter here
  const data = await buildCompendium({ read, keep: (kind, name, source) => linker.has(kind, name, source) });
  fs.writeFileSync(path.join(ROOT, "data", "imported.json"), JSON.stringify(data));
  console.log(`Imported (${notes.length} compendium notes):`, summarize(data));
}
