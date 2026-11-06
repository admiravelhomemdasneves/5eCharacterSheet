// The SRD rules data bundled with the plugin (data/srd-5.1.json, data/srd-5.2.1.json). esbuild bundles those files as
// text (see esbuild.config.mjs), so loading the plugin doesn't build its objects: they are parsed only
// when the SRD is the rules data, a fresh copy each time (Linker#attach changes the data it is given).
import type { Compendium } from "../rules/engine.ts";
import srd51 from "../../data/srd-5.1.json";
import srd521 from "../../data/srd-5.2.1.json";


/** A new copy of the SRD data. The import is the file's text in the plugin; a JSON import elsewhere is copied. */
export function loadSrd(ruleset = "5e-2014"): Compendium {
  const bundled: unknown = ruleset === "5e-2024" ? srd521 : srd51;
  return typeof bundled === "string" ? (JSON.parse(bundled) as Compendium) : structuredClone(bundled as Compendium);
}
