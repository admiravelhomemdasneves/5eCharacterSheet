// The SRD 5.1 rules data bundled with the plugin (data/srd-5.1.json). esbuild bundles that file as
// text (see esbuild.config.mjs), so loading the plugin doesn't build its objects: they are parsed only
// when the SRD is the rules data, a fresh copy each time (Linker#attach changes the data it is given).
import type { Compendium } from "../rules/engine.ts";
import srd from "../../data/srd-5.1.json";


/** A new copy of the SRD data. The import is the file's text in the plugin; a JSON import elsewhere is copied. */
export function loadSrd(): Compendium {
  const bundled: unknown = srd;
  return typeof bundled === "string" ? (JSON.parse(bundled) as Compendium) : structuredClone(bundled as Compendium);
}
