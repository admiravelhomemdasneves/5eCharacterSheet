// Test data: the personal dataset (data/imported.json, built from the user's own 5etools copy and
// compendium) with links attached, when it exists. Not in the repository, so those tests skip in CI.
import fs from "node:fs";
import path from "node:path";
import { Linker } from "../src/data/links.ts";
import { ROOT, compendiumNotes, personalPaths } from "../scripts/local.ts";

export { ROOT };
export const { vault: VAULT, compendium: COMPENDIUM } = personalPaths();
const personalFile = path.join(ROOT, "data", "imported.json");
export const hasPersonal = !!VAULT && !!COMPENDIUM && fs.existsSync(personalFile) && fs.existsSync(path.join(VAULT, COMPENDIUM));

export function vaultLinker() {
  return new Linker(COMPENDIUM, compendiumNotes(VAULT, COMPENDIUM));
}
export function personalData() {
  if (!hasPersonal) return null;
  return vaultLinker().attach(JSON.parse(fs.readFileSync(personalFile, "utf8")));
}
export function srdData() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "srd-5.1.json"), "utf8"));
}
