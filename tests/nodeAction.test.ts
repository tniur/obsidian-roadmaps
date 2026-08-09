import { describe, expect, it } from "vitest";
import {
  alternateNodeAction,
  isFileNodeAction,
  nodeActionLabel,
  nodeMenuActions,
  primaryNodeAction,
} from "../src/domain/nodeAction";
import { ROADMAP_NODE_KINDS } from "../src/domain/types";

/** Derived, not listed: a newly added kind joins these assertions instead of slipping past them. */
const FILE_KINDS = ROADMAP_NODE_KINDS.filter((kind) => kind !== "text" && kind !== "url");

describe("primaryNodeAction", () => {
  it("opens the link for url nodes regardless of the file preference", () => {
    expect(primaryNodeAction("url", "preview", false)).toBe("open");
    expect(primaryNodeAction("url", "open", false)).toBe("open");
  });

  it("edits text nodes in place", () => {
    expect(primaryNodeAction("text", "preview", false)).toBe("edit-text");
    expect(primaryNodeAction("text", "open", false)).toBe("edit-text");
  });

  it("reads text nodes instead of editing them while the board is locked", () => {
    expect(primaryNodeAction("text", "preview", true)).toBe("preview");
  });

  it("follows the board preference for file-backed nodes", () => {
    for (const kind of FILE_KINDS) {
      expect(primaryNodeAction(kind, "preview", false)).toBe("preview");
      expect(primaryNodeAction(kind, "open", false)).toBe("open");
    }
  });

  it("keeps opening a file-backed node available while locked", () => {
    expect(primaryNodeAction("note", "open", true)).toBe("open");
    expect(primaryNodeAction("note", "preview", true)).toBe("preview");
  });
});

describe("alternateNodeAction", () => {
  it("offers the action the preference displaced for file-backed nodes", () => {
    for (const kind of FILE_KINDS) {
      expect(alternateNodeAction(kind, "preview", false)).toBe("open");
      expect(alternateNodeAction(kind, "open", false)).toBe("preview");
    }
  });

  it("offers the link card for url nodes", () => {
    expect(alternateNodeAction("url", "preview", false)).toBe("preview");
  });

  it("has nothing to offer for text nodes, whose content is already on the card", () => {
    expect(alternateNodeAction("text", "preview", false)).toBeNull();
    expect(alternateNodeAction("text", "preview", true)).toBeNull();
  });

  it("ignores the lock for file-backed nodes, which stay readable either way", () => {
    expect(alternateNodeAction("note", "preview", true)).toBe("open");
  });
});

describe("nodeMenuActions", () => {
  it("offers both ways into a file-backed node, the preferred one first", () => {
    expect(nodeMenuActions("note", "preview", false)).toEqual(["preview", "open"]);
    expect(nodeMenuActions("note", "open", false)).toEqual(["open", "preview"]);
  });

  it("offers the link and its card for url nodes", () => {
    expect(nodeMenuActions("url", "preview", false)).toEqual(["open", "preview"]);
  });

  it("leaves in-place editing out, since the card already offers it", () => {
    expect(nodeMenuActions("text", "preview", false)).toEqual([]);
  });

  it("falls back to the preview row once a locked board takes editing away", () => {
    expect(nodeMenuActions("text", "preview", true)).toEqual(["preview"]);
  });
});

describe("nodeActionLabel", () => {
  it("names the destination an open action leads to", () => {
    expect(nodeActionLabel("open", "url")).toBe("Open link");
    expect(nodeActionLabel("open", "image")).toBe("Open image");
    expect(nodeActionLabel("open", "note")).toBe("Open in Obsidian");
    expect(nodeActionLabel("preview", "url")).toBe("Open preview");
    expect(nodeActionLabel("edit-text", "text")).toBe("Edit text");
  });
});

describe("isFileNodeAction", () => {
  it("accepts the stored values and rejects anything else", () => {
    expect(isFileNodeAction("preview")).toBe(true);
    expect(isFileNodeAction("open")).toBe(true);
    expect(isFileNodeAction("edit-text")).toBe(false);
    expect(isFileNodeAction("")).toBe(false);
  });
});
