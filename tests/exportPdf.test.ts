import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { EXPORT_MAX_SIDE, EXPORT_PADDING, exportLayout, visibleBounds, wrapPngInPdf } from "../src/view/exportPdf";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("visibleBounds", () => {
  it("frames top-level nodes with absolute coordinates", () => {
    const bounds = visibleBounds([
      { id: "a", position: { x: 10, y: 20 }, width: 100, height: 50 },
      { id: "b", position: { x: 200, y: -30 }, measured: { width: 80, height: 40 } },
    ]);

    expect(bounds).toEqual({ x: 10, y: -30, width: 270, height: 100 });
  });

  it("offsets cluster members by the parent position", () => {
    const bounds = visibleBounds([
      { id: "cluster", position: { x: 100, y: 100 }, width: 300, height: 200 },
      { id: "member", parentId: "cluster", position: { x: 250, y: 150 }, width: 100, height: 60 },
    ]);

    expect(bounds).toEqual({ x: 100, y: 100, width: 350, height: 210 });
  });

  it("skips hidden nodes and returns null when nothing is visible", () => {
    const hidden = { id: "a", position: { x: 0, y: 0 }, width: 10, height: 10, hidden: true };

    expect(visibleBounds([hidden, { id: "b", position: { x: 5, y: 5 }, width: 10, height: 10 }])).toEqual({
      x: 5,
      y: 5,
      width: 10,
      height: 10,
    });
    expect(visibleBounds([hidden])).toBeNull();
    expect(visibleBounds([])).toBeNull();
  });
});

describe("exportLayout", () => {
  it("keeps 1:1 scale with padding for small boards", () => {
    const layout = exportLayout({ x: 100, y: 50, width: 400, height: 200 });

    expect(layout.width).toBe(400 + EXPORT_PADDING * 2);
    expect(layout.height).toBe(200 + EXPORT_PADDING * 2);
    expect(layout.transform).toBe(`translate(${EXPORT_PADDING - 100}px, ${EXPORT_PADDING - 50}px) scale(1)`);
  });

  it("downscales uniformly when a side exceeds the bitmap cap", () => {
    const layout = exportLayout({ x: 0, y: 0, width: 10000, height: 1000 });
    const scale = EXPORT_MAX_SIDE / (10000 + EXPORT_PADDING * 2);

    expect(layout.width).toBe(EXPORT_MAX_SIDE);
    expect(layout.height).toBe(Math.round((1000 + EXPORT_PADDING * 2) * scale));
    expect(layout.transform).toContain(`scale(${scale})`);
  });
});

describe("wrapPngInPdf", () => {
  it("produces a single-page PDF sized to the image", async () => {
    const bytes = await wrapPngInPdf(PNG_1PX, 320, 240);

    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();

    expect(width).toBe(320);
    expect(height).toBe(240);
  });
});
