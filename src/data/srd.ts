// The SRD 5.1 rules data bundled with the plugin (data/srd-5.1.json). esbuild bundles that file as
// text (see esbuild.config.mjs), so loading the plugin doesn't build its objects: they are parsed only
// when the SRD is the rules data, a fresh copy each time (Linker#attach changes the data it is given).
import type { Compendium } from "../rules/engine.ts";
import srd from "../../data/srd-5.1.json";

/** The SRD's licence notice, shown in the settings and stored in the data (meta.attribution). */
export const SRD_ATTRIBUTION = "This work includes material taken from the System Reference Document 5.1 (\"SRD 5.1\") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.";

/** A new copy of the SRD data. The import is the file's text in the plugin; a JSON import elsewhere is copied. */
export function loadSrd(): Compendium {
  const bundled: unknown = srd;
  return typeof bundled === "string" ? (JSON.parse(bundled) as Compendium) : structuredClone(bundled as Compendium);
}
