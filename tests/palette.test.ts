import { describe, expect, it } from "vitest";
import { colorLabel, DEFAULT_PALETTE, isHexColor, normalizeHexColor, sanitizePalette } from "../src/domain/palette";

describe("colorLabel", () => {
  it("names theme tokens and shows custom colors as uppercase hex", () => {
    expect(colorLabel("var(--color-red)")).toBe("Red");
    expect(colorLabel("#ab12cd")).toBe("#AB12CD");
  });
});

describe("isHexColor", () => {
  it("accepts six-digit hex in either case and rejects everything else", () => {
    expect(isHexColor("#ab12cd")).toBe(true);
    expect(isHexColor("#AB12CD")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("var(--color-red)")).toBe(false);
    expect(isHexColor("rgb(1,2,3)")).toBe(false);
  });
});

describe("normalizeHexColor", () => {
  it("lowercases hex and leaves other values untouched", () => {
    expect(normalizeHexColor("#AB12CD")).toBe("#ab12cd");
    expect(normalizeHexColor("var(--color-red)")).toBe("var(--color-red)");
  });
});

describe("sanitizePalette", () => {
  it("falls back to the default palette when the stored value is not an array", () => {
    expect(sanitizePalette(undefined)).toEqual([...DEFAULT_PALETTE]);
    expect(sanitizePalette("garbage")).toEqual([...DEFAULT_PALETTE]);
  });

  it("keeps only known theme tokens and hex values, normalized", () => {
    const input = ["var(--color-red)", "var(--color-unknown)", "#AB12CD", "red", "rgb(1,2,3)", 42];

    expect(sanitizePalette(input)).toEqual(["var(--color-red)", "#ab12cd"]);
  });

  it("collapses duplicates after normalization", () => {
    expect(sanitizePalette(["#ABCDEF", "#abcdef", "var(--color-red)", "var(--color-red)"])).toEqual([
      "#abcdef",
      "var(--color-red)",
    ]);
  });

  it("respects an intentionally emptied palette", () => {
    expect(sanitizePalette([])).toEqual([]);
  });
});
