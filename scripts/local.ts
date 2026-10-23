// Personal paths for the Node tooling (the build, the data scripts and the tests): from the VAULT and
// COMPENDIUM environment variables or local.config.json (git-ignored), never from the repository.
import fs from "node:fs";
import path from "node:path";
import { noteInfoFromText, type NoteInfo } from "../src/data/links.ts";

export const ROOT = path.resolve(import.meta.dirname, "..");

/** The vault and the compendium folder in it ("" when not set). */
export function personalPaths(): { vault: string; compendium: string } {
  const file = path.join(ROOT, "local.config.json");
  const local = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}) as { vault?: string; compendium?: string };
  return { vault: process.env.VAULT || local.vault || "", compendium: process.env.COMPENDIUM || local.compendium || "" };
}

/** The notes of a ttrpg-convert-cli compendium (its "compendium" folder), with their vault paths. */
export function compendiumNotes(vault: string, compendium: string): NoteInfo[] {
  const notes: NoteInfo[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        const info = noteInfoFromText(path.relative(vault, p).split(path.sep).join("/").replace(/\.md$/, ""), fs.readFileSync(p, "utf8").slice(0, 4000));
        if (info) notes.push(info);
      }
    }
  };
  walk(path.join(vault, compendium, "compendium"));
  return notes;
}
