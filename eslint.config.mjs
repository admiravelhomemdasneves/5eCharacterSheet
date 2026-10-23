// Same rules as the Obsidian community directory review (eslint-plugin-obsidianmd, recommended).
// The tests and build scripts are linted too, without the rules that only make sense in a plugin.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["dist/", "node_modules/", "vendor/", "data/", "esbuild.config.mjs", "eslint.config.mjs"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.*"] },
      },
    },
  },
  // Node tooling: Node modules and the console are allowed (tsc checks the globals), node:test's
  // test() is not awaited, and the 5etools and sheet data read from JSON is untyped
  {
    files: ["test/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "no-undef": "off",
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/hardcoded-config-path": "off",
      "obsidianmd/rule-custom-message": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
]);
