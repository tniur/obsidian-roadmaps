import { describe, expect, it } from "vitest";
import { createNoteNode, createTextNode, createUrlNode } from "../src/domain/create";
import { nodeSearchText, searchNodes } from "../src/domain/search";
import type { RoadmapCluster } from "../src/domain/types";
import { makeState } from "./helpers";

describe("searchNodes", () => {
  it("matches on file-name title, description and source", () => {
    const note = createNoteNode("notes/auth-service.md", { x: 0, y: 0 });
    const url = { ...createUrlNode("https://example.com/login", { x: 0, y: 100 }), description: "session flow" };
    const state = makeState([note, url]);

    expect(searchNodes(state, "auth")).toEqual([note.id]);
    expect(searchNodes(state, "session")).toEqual([url.id]);
    expect(searchNodes(state, "example.com")).toEqual([url.id]);
  });

  it("requires every whitespace term to match and ignores case", () => {
    const node = { ...createNoteNode("notes/user-auth.md", { x: 0, y: 0 }), description: "OAuth login" };
    const state = makeState([node]);

    expect(searchNodes(state, "AUTH login")).toEqual([node.id]);
    expect(searchNodes(state, "auth missing")).toEqual([]);
  });

  it("orders results top-to-bottom then left-to-right", () => {
    const a = createNoteNode("notes/a.md", { x: 100, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    const c = createNoteNode("notes/c.md", { x: 0, y: 50 });
    const state = makeState([a, b, c]);

    expect(searchNodes(state, "notes")).toEqual([b.id, a.id, c.id]);
  });

  it("skips members of a collapsed cluster", () => {
    const inside = { ...createNoteNode("notes/auth.md", { x: 0, y: 0 }), clusterId: "cl" };
    const outside = createNoteNode("notes/auth-page.md", { x: 0, y: 200 });
    const cluster: RoadmapCluster = {
      id: "cl",
      title: "Group",
      layout: { x: 0, y: 0, width: 300, height: 200 },
      collapsed: true,
    };
    const state = makeState([inside, outside], [], [cluster]);

    expect(searchNodes(state, "auth")).toEqual([outside.id]);
  });

  it("returns nothing for an empty query", () => {
    const node = createNoteNode("notes/auth.md", { x: 0, y: 0 });

    expect(searchNodes(makeState([node]), "   ")).toEqual([]);
  });
});

describe("nodeSearchText", () => {
  it("includes title, description and text-node content", () => {
    const text = { ...createTextNode("Buy milk", { x: 0, y: 0 }), description: "grocery" };
    const haystack = nodeSearchText(text);

    expect(haystack).toContain("buy milk");
    expect(haystack).toContain("grocery");
  });
});
