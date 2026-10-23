// Bundles the plugin into dist/ (main.js, manifest.json, styles.css — what a release ships).
// The SRD data is bundled inside main.js, as text: src/data/srd.ts parses it only when it is used. With --install it is also copied into a vault
// (VAULT env var or "vault" in local.config.json), together with the personal imported data if built.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { personalPaths } from "./scripts/local.ts";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "browser",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  loader: { ".json": "json" },
  plugins: [{
    name: "srd-as-text",
    setup(build) {
      build.onLoad({ filter: /[\\/]data[\\/]srd-5\.1\.json$/ }, (args) => ({ contents: fs.readFileSync(args.path, "utf8"), loader: "text" }));
    },
  }],
  outfile: "dist/main.js",
  logLevel: "info",
});
for (const f of ["manifest.json", "styles.css"]) fs.copyFileSync(f, path.join("dist", f));

if (process.argv.includes("--install")) {
  const { vault } = personalPaths();
  if (!vault) throw new Error("Set VAULT (or create local.config.json with { \"vault\" }) to install into a vault.");
  const dest = path.join(vault, ".obsidian", "plugins", process.env.PLUGIN_DIR || manifest.id);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join("dist", f), path.join(dest, f));
  if (fs.existsSync("data/imported.json")) {
    fs.mkdirSync(path.join(dest, "data"), { recursive: true });
    fs.copyFileSync("data/imported.json", path.join(dest, "data", "imported.json"));
  }
  console.log("installed to", dest);
}
