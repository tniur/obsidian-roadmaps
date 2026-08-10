import stylistic from "@stylistic/eslint-plugin";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import obsidianmd from "eslint-plugin-obsidianmd";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Proper nouns the sentence-case rule must not lowercase. Plain "canvas" stays a common noun. */
const BRANDS = ["Obsidian", "Markdown", "JSON Canvas", "PDF", "PNG"];

/** Navigation paths quote on-screen labels verbatim; re-casing them would misdirect the reader. */
const UI_PATH_PATTERN = "→";

/** Drives the pre-commit hook only, and never reaches the bundle shipped to users. */
const BUILD_ONLY_DEPENDENCIES = ["lint-staged"];

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "main.js", "*.config.mjs", "version-bump.mjs"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { brands: BRANDS, ignoreRegex: [UI_PATH_PATTERN] }],
      "depend/ban-dependencies": ["error", { allowed: BUILD_ONLY_DEPENDENCIES }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ["vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/lines-between-class-members": ["error", "always", { exceptAfterSingleLine: true }],
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "block-like", next: "block-like" },
        { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
        { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
        { blankLine: "always", prev: "function", next: "*" },
        { blankLine: "always", prev: "*", next: "function" },
      ],
    },
  },
);
