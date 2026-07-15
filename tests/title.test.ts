import { describe, expect, it } from "vitest";
import { createAttachmentNode, createNoteNode, createTextNode, createUrlNode } from "../src/domain/create";
import { nodeSourceLabel } from "../src/domain/title";

describe("preview source label", () => {
  it("shows the file name with extension for file-backed nodes", () => {
    expect(nodeSourceLabel(createNoteNode("notes/design audit.md", { x: 0, y: 0 }))).toBe("design audit.md");
    expect(nodeSourceLabel(createAttachmentNode("files/spec-v2.pdf", { x: 0, y: 0 }))).toBe("spec-v2.pdf");
  });

  it("shows the hostname for url nodes", () => {
    expect(nodeSourceLabel(createUrlNode("https://obsidian.md/plugins", { x: 0, y: 0 }))).toBe("obsidian.md");
  });

  it("yields nothing for text nodes", () => {
    expect(nodeSourceLabel(createTextNode("Kickoff sync", { x: 0, y: 0 }))).toBeUndefined();
  });

  it("ignores the custom title: the label identifies the source, not the node", () => {
    const node = { ...createAttachmentNode("files/spec-v2.pdf", { x: 0, y: 0 }), title: "Product spec" };

    expect(nodeSourceLabel(node)).toBe("spec-v2.pdf");
  });
});
