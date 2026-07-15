import { describe, expect, it } from "vitest";
import { clampPreviewWidth, PREVIEW_DEFAULT_WIDTH, PREVIEW_MAX_WIDTH, PREVIEW_MIN_WIDTH } from "../src/constants";

describe("preview width clamp", () => {
  it("keeps values inside the designed bounds and rounds to whole pixels", () => {
    expect(clampPreviewWidth(500.4)).toBe(500);
    expect(clampPreviewWidth(PREVIEW_MIN_WIDTH - 100)).toBe(PREVIEW_MIN_WIDTH);
    expect(clampPreviewWidth(PREVIEW_MAX_WIDTH + 100)).toBe(PREVIEW_MAX_WIDTH);
  });

  it("falls back to the default for non-finite persisted values", () => {
    expect(clampPreviewWidth(Number.NaN)).toBe(PREVIEW_DEFAULT_WIDTH);
    expect(clampPreviewWidth(Number.POSITIVE_INFINITY)).toBe(PREVIEW_DEFAULT_WIDTH);
  });
});
