// Test data: the personal dataset (data/imported.json, built from the user's own 5etools copy and
// compendium) with links attached, when it exists. Not in the repository, so those tests skip in CI.
import fs from "node:fs";
import path from "node:path";
import { Linker, noteInfoFromText, type NoteInfo } from "../src/data/links.ts";

export const ROOT = path.resolve(import.meta.dirname, "..");
// personal paths come from env vars or local.config.json (git-ignored)
const local = fs.existsSync(path.join(ROOT, "local.config.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "local.config.json"), "utf8")) : {};
export const VAULT: string = process.env.VAULT || local.vault || "";
export const COMPENDIUM: string = process.env.COMPENDIUM || local.compendium || "";
const personalFile = path.join(ROOT, "data", "imported.json");
export const hasPersonal = !!VAULT && !!COMPENDIUM && fs.existsSync(personalFile) && fs.existsSync(path.join(VAULT, COMPENDIUM));

export function vaultLinker() {
  const notes: NoteInfo[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        const info = noteInfoFromText(path.relative(VAULT, p).split(path.sep).join("/").replace(/\.md$/, ""), fs.readFileSync(p, "utf8").slice(0, 4000));
        if (info) notes.push(info);
      }
    }
  };
  walk(path.join(VAULT, COMPENDIUM, "compendium"));
  return new Linker(COMPENDIUM, notes);
}
export function personalData() {
  if (!hasPersonal) return null;
  return vaultLinker().attach(JSON.parse(fs.readFileSync(personalFile, "utf8")));
}
export function srdData() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "srd-5.1.json"), "utf8"));
}
