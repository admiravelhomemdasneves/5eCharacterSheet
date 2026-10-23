// Builds sheet data from a 5etools data folder, using the same code as the plugin's importer.
//   node scripts/build-data.ts srd                 -> data/srd-5.1.json (bundled in the plugin)
//   node scripts/build-data.ts import [compendium] -> data/imported.json (personal, never committed)
// `import` keeps only entries that have a note in the compendium folder of a vault (VAULT and
// COMPENDIUM env vars, or local.config.json),
// which reproduces the menus of a ttrpg-convert-cli compendium.
import fs from "node:fs";
import path from "node:path";
import { buildCompendium, summarize } from "../src/data/build.ts";
import { Linker } from "../src/data/links.ts";
import { SRD_ATTRIBUTION } from "../src/data/srd.ts";
import { ROOT, compendiumNotes, personalPaths } from "./local.ts";

const DATA = process.env.FIVETOOLS_DATA || path.join(ROOT, "vendor", "5etools-data");
const read = async (rel: string) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const mode = process.argv[2] || "srd";

if (mode === "srd") {
  const data = await buildCompendium({ read, srdOnly: true, rules2014Only: true });
  const out = { ...data, meta: { ...data.meta, attribution: SRD_ATTRIBUTION } };
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data", "srd-5.1.json"), JSON.stringify(out));
  console.log("SRD:", summarize(data));
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
