// Same rules as the Obsidian community directory review (eslint-plugin-obsidianmd, recommended).
// Only the plugin code in src/ is linted; build scripts and tests are Node-only tooling.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["dist/", "node_modules/", "vendor/", "scripts/", "test/", "data/", "esbuild.config.mjs", "eslint.config.mjs"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.*"] },
      },
    },
  },
]);
