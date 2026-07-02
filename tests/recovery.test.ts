import { describe, expect, it } from "vitest";
import { createImageNode, createNoteNode, createTextNode, createUrlNode } from "../src/domain/create";
import { createRoadmapDocument, readState, rebuildState } from "../src/state/document";
import { RoadmapSession } from "../src/state/session";

function populatedContent(): { content: string; ids: Record<string, string> } {
  const content = createRoadmapDocument("Board");
  const state = readState(content);

  if (state === null) {
    throw new Error("expected a state block");
  }

  const session = new RoadmapSession(state, content);
  const note = createNoteNode("notes/a.md", { x: 0, y: 0 });
  const url = createUrlNode("https://example.com/path", { x: 300, y: 0 });
  const image = createImageNode("img/pic.png", { x: 600, y: 0 });
  const text = createTextNode("Free text", { x: 900, y: 0 });
  const clustered = createNoteNode("notes/b.md", { x: 0, y: 300 });

  session.addNodes([note, url, image, text, clustered]);
  session.updateNodeMeta(note.id, { title: "Custom", description: "Details", status: "done", priority: "high" });
  session.createClusterFromNodes([clustered.id], "Group");
  session.addEdge(note.id, url.id);
  const edgeId = Object.keys(session.state.edges)[0];

  session.updateEdge(edgeId, { label: "depends" });

  return {
    content: session.content,
    ids: { note: note.id, url: url.id, image: image.id, text: text.id, clustered: clustered.id, edge: edgeId },
  };
}

function stripStateBlock(content: string): string {
  return content.replace(/%%[ \t]*roadmap:state[\s\S]*?%%/, "").replace(/\n{3,}/g, "\n\n");
}

describe("state recovery from the body", () => {
  it("throws out of readState on a corrupted state block", () => {
    const content = createRoadmapDocument("Board").replace('"v": 1', '"v": ');

    expect(() => readState(content)).toThrow();
  });

  it("rebuilds nodes with sources, meta and tags from body markers", () => {
    const { content, ids } = populatedContent();
    const rebuilt = rebuildState(stripStateBlock(content));
    const note = rebuilt.nodes[ids.note];

    expect(note.source).toEqual({ type: "note", file: "notes/a.md" });
    expect(note.title).toBe("Custom");
    expect(note.description).toBe("Details");
    expect(note.status).toBe("done");
    expect(note.priority).toBe("high");
    expect(rebuilt.nodes[ids.url].source).toEqual({ type: "url", url: "https://example.com/path" });
    expect(rebuilt.nodes[ids.image].source).toEqual({ type: "image", file: "img/pic.png" });
    expect(rebuilt.nodes[ids.text].title).toBe("Free text");
  });

  it("rebuilds cluster membership and keeps stable ids", () => {
    const { content, ids } = populatedContent();
    const rebuilt = rebuildState(stripStateBlock(content));
    const clusters = Object.values(rebuilt.clusters);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].title).toBe("Group");
    expect(rebuilt.nodes[ids.clustered].clusterId).toBe(clusters[0].id);
  });

  it("rebuilds edges with direction and label from relations lines", () => {
    const { content, ids } = populatedContent();
    const rebuilt = rebuildState(stripStateBlock(content));
    const edge = rebuilt.edges[ids.edge];

    expect(edge).toBeDefined();
    expect(edge.from).toEqual({ type: "node", id: ids.note });
    expect(edge.to).toEqual({ type: "node", id: ids.url });
    expect(edge.direction).toBe("forward");
    expect(edge.label).toBe("depends");
  });

  it("returns an empty state for a body without markers", () => {
    const rebuilt = rebuildState(createRoadmapDocument("Board").replace(/%%[\s\S]*%%/, ""));

    expect(Object.keys(rebuilt.nodes)).toHaveLength(0);
    expect(Object.keys(rebuilt.edges)).toHaveLength(0);
  });
});
