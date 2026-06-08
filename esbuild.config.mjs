import esbuild from "esbuild";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import builtins from "builtin-modules";

const root = path.dirname(fileURLToPath(import.meta.url));
const prod = process.argv.includes("production");

const outDir = process.env.OBSIDIAN_PLUGIN_DIR
  ? path.resolve(process.env.OBSIDIAN_PLUGIN_DIR)
  : path.resolve(root, "dist");

fs.mkdirSync(outDir, { recursive: true });

const flowCssPath = path.join(root, "node_modules/@xyflow/react/dist/style.css");

const copyStatic = {
  name: "copy-static",
  setup(build) {
    build.onEnd(() => {
      fs.copyFileSync(path.join(root, "manifest.json"), path.join(outDir, "manifest.json"));
      const tokens = fs.readFileSync(path.join(root, "styles.css"), "utf8");
      const flowCss = fs.readFileSync(flowCssPath, "utf8");
      fs.writeFileSync(path.join(outDir, "styles.css"), `${flowCss}\n${tokens}\n`);
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
    ...builtins,
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
