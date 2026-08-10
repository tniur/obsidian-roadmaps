import esbuild from "esbuild";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";

const root = path.dirname(fileURLToPath(import.meta.url));
const prod = process.argv.includes("production");

const outDir = process.env.OBSIDIAN_PLUGIN_DIR
  ? path.resolve(process.env.OBSIDIAN_PLUGIN_DIR)
  : path.resolve(root, "dist");

fs.mkdirSync(outDir, { recursive: true });

const flowCssPath = path.join(root, "node_modules/@xyflow/react/dist/style.css");

// Obsidian loads a single styles.css per plugin; the source is split into partials for authoring.
// Order is the CSS cascade order (tokens first). Partials are joined with a newline below, which
// restores the blank line between sections. Keep in sync when adding or renaming a partial.
const stylePartials = ["tokens", "base", "preview", "chrome", "nodes", "clusters", "edges", "modals", "menus"].map(
  (name) => path.join(root, "styles", `${name}.css`),
);

const copyStatic = {
  name: "copy-static",
  setup(build) {
    build.onEnd(() => {
      fs.copyFileSync(path.join(root, "manifest.json"), path.join(outDir, "manifest.json"));
      const styles = stylePartials.map((file) => fs.readFileSync(file, "utf8")).join("\n");
      const flowCss = fs.readFileSync(flowCssPath, "utf8");
      fs.writeFileSync(path.join(outDir, "styles.css"), `${flowCss}\n${styles}\n`);
    });
  },
};

const options = {
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "browser",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development"),
  },
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ],
  outfile: path.join(outDir, "main.js"),
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  logLevel: "info",
  plugins: [copyStatic],
};

if (prod) {
  await esbuild.build(options);
} else {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`esbuild: watching, output -> ${outDir}`);
}
