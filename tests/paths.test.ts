import { describe, expect, it } from "vitest";
import { formatFileSize, isSafeUrl, normalizeHttpUrl } from "../src/domain/paths";

describe("url safety", () => {
  it("accepts http, https and obsidian schemes only", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("http://example.com")).toBe(true);
    expect(isSafeUrl("obsidian://open?vault=v")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("example.com")).toBe(false);
  });

  it("prefixes bare addresses with https and keeps safe urls untouched", () => {
    expect(normalizeHttpUrl("example.com/docs")).toBe("https://example.com/docs");
    expect(normalizeHttpUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeHttpUrl("HTTP://example.com")).toBe("HTTP://example.com");
  });
});

describe("human-readable file size", () => {
  it("scales through units with one decimal below ten", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(12 * 1024)).toBe("12 KB");
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });

  it("promotes to the next unit at the rounding boundary instead of showing 1024", () => {
    expect(formatFileSize(1048570)).toBe("1 MB");
    expect(formatFileSize(1073741800)).toBe("1 GB");
  });
});
