import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`${root}${name}`, "utf8")) as Record<string, unknown>;

describe("plugin manifest", () => {
  it("declares the plugin id the plugin folder must match", () => {
    const manifest = readJson("manifest.json");

    expect(manifest.id).toBe("roadmaps");
  });

  it("keeps manifest and package versions in sync", () => {
    const manifest = readJson("manifest.json");
    const pkg = readJson("package.json");

    expect(manifest.version).toBe(pkg.version);
  });
});
