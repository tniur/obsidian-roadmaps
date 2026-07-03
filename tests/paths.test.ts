import { describe, expect, it } from "vitest";
import { isSafeUrl, normalizeHttpUrl } from "../src/domain/paths";

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
