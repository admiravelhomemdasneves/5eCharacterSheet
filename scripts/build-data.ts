// Builds sheet data from a 5etools data folder, using the same code as the plugin's importer.
//   node scripts/build-data.ts srd                 -> data/srd-5.1.json (bundled in the plugin)
//   node scripts/build-data.ts import [compendium] -> data/imported.json (personal, never committed)
// `import` keeps only entries that have a note in the compendium folder of a vault (VAULT and
// COMPENDIUM env vars, or local.config.json),
// which reproduces the menus of a ttrpg-convert-cli compendium.
import fs from "node:fs";
import path from "node:path";
import { buildCompendium, summarize } from "../src/data/build.ts";
import { Linker, noteInfoFromText, type NoteInfo } from "../src/data/links.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = process.env.FIVETOOLS_DATA || path.join(ROOT, "vendor", "5etools-data");
const read = async (rel: string) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const mode = process.argv[2] || "srd";

if (mode === "srd") {
  const data = await buildCompendium({ read, srdOnly: true, rules2014Only: true });
  const out = { ...data, meta: { ...data.meta, attribution: SRD_ATTRIBUTION() } };
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data", "srd-5.1.json"), JSON.stringify(out));
  console.log("SRD:", summarize(data));
} else {
  // personal paths come from env vars or local.config.json (git-ignored), never from the repository
  const local = fs.existsSync(path.join(ROOT, "local.config.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "local.config.json"), "utf8")) : {};
  const vault = process.env.VAULT || local.vault;
  const comp = process.argv[3] || process.env.COMPENDIUM || local.compendium;
  if (!vault || !comp) throw new Error("Set VAULT and COMPENDIUM (or create local.config.json with { \"vault\", \"compendium\" }).");
  const notes: NoteInfo[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        const rel = path.relative(vault, p).split(path.sep).join("/").replace(/\.md$/, "");
        const info = noteInfoFromText(rel, fs.readFileSync(p, "utf8").slice(0, 4000));
        if (info) notes.push(info);
      }
    }
  };
  walk(path.join(vault, comp, "compendium"));
  const linker = new Linker(comp, notes);
  // the compendium already decides what is in (it was generated with 2014 sources), so no edition filter here
  const data = await buildCompendium({ read, keep: (kind, name, source) => linker.has(kind, name, source) });
  fs.writeFileSync(path.join(ROOT, "data", "imported.json"), JSON.stringify(data));
  console.log(`Imported (${notes.length} compendium notes):`, summarize(data));
}

function SRD_ATTRIBUTION() {
  return "This work includes material taken from the System Reference Document 5.1 (\"SRD 5.1\") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.";
}
