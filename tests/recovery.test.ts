import { describe, expect, it } from "vitest";
import { createImageNode, createNoteNode, createTextNode, createUrlNode } from "../src/domain/create";
import { createRoadmapDocument, readState } from "../src/state/document";
import { loadDocument, rebuildDocument, rebuildState } from "../src/state/reconcile";
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
  session.updateNodeMeta(url.id, { color: "var(--color-red)" });
  session.setNodeAlign(url.id, { h: "center", v: "bottom" });
  session.createClusterFromNodes([clustered.id], "Group");
  const clusterId = Object.keys(session.state.clusters)[0];

  session.setClusterColor(clusterId, "var(--color-blue)");
  session.addEdge(note.id, url.id, "right", "left");
  const edgeId = Object.keys(session.state.edges)[0];

  session.updateEdge(edgeId, { label: "depends", line: "dashed" });

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

  it("rebuilds presentation from marker attrs: colors, alignment, edge style and sides", () => {
    const { content, ids } = populatedContent();
    const rebuilt = rebuildState(stripStateBlock(content));
    const edge = rebuilt.edges[ids.edge];

    expect(rebuilt.nodes[ids.url].style?.color).toBe("var(--color-red)");
    expect(rebuilt.nodes[ids.url].align).toEqual({ h: "center", v: "bottom" });
    expect(Object.values(rebuilt.clusters)[0].style?.color).toBe("var(--color-blue)");
    expect(edge.style?.line).toBe("dashed");
    expect(edge.fromSide).toBe("right");
    expect(edge.toSide).toBe("left");
  });

  it("ignores malformed marker attrs instead of poisoning the state", () => {
    const { content, ids } = populatedContent();
    const tainted = stripStateBlock(content).replace(
      `<!-- roadmap-node:id=${ids.note} type=note -->`,
      `<!-- roadmap-node:id=${ids.note} type=note color=url(javascript:x) ah=diagonal -->`,
    );
    const rebuilt = rebuildState(tainted);

    expect(rebuilt.nodes[ids.note]).toBeDefined();
    expect(rebuilt.nodes[ids.note].style).toBeUndefined();
    expect(rebuilt.nodes[ids.note].align).toBeUndefined();
  });

  it("returns an empty state for a body without markers", () => {
    const rebuilt = rebuildState(createRoadmapDocument("Board").replace(/%%[\s\S]*%%/, ""));

    expect(Object.keys(rebuilt.nodes)).toHaveLength(0);
    expect(Object.keys(rebuilt.edges)).toHaveLength(0);
  });

  it("skips markers with an unknown node kind instead of poisoning the state", () => {
    const { content, ids } = populatedContent();
    const broken = stripStateBlock(content).replace(
      `<!-- roadmap-node:id=${ids.note} type=note -->`,
      `<!-- roadmap-node:id=${ids.note} type=banana -->`,
    );
    const rebuilt = rebuildState(broken);

    expect(rebuilt.nodes[ids.note]).toBeUndefined();
    expect(rebuilt.nodes[ids.url]).toBeDefined();
  });
});

describe("document open pipeline", () => {
  it("returns the input untouched when nothing needs fixing", () => {
    const { content } = populatedContent();
    const loaded = loadDocument(content);

    expect(loaded.content).toBe(content);
    expect(loaded.warnings).toEqual([]);
  });

  it("rebuilds a missing state block and reports it", () => {
    const { content, ids } = populatedContent();
    const loaded = loadDocument(stripStateBlock(content));

    expect(loaded.warnings).toContain("rebuilt-state");
    expect(loaded.state.nodes[ids.note]).toBeDefined();
    expect(readState(loaded.content)?.nodes[ids.note]).toBeDefined();
  });

  it("restores body blocks for nodes a truncated body lost", () => {
    const { content, ids } = populatedContent();
    const truncated = content.replace(/<!-- roadmap-node:id=\S+ type=\w+(?: \S+=\S+)* -->/g, "");
    const loaded = loadDocument(truncated);

    expect(loaded.warnings).toContain("restored-nodes");
    expect(loaded.state.nodes[ids.note]).toBeDefined();
    expect(loaded.content).toContain(`<!-- roadmap-node:id=${ids.note} type=note -->`);
  });

  it("normalizes a stale marker attr back to the state's value on load", () => {
    const { content, ids } = populatedContent();
    const tainted = content.replace("color=var(--color-red)", "color=var(--color-green)");
    const loaded = loadDocument(tainted);

    expect(loaded.state.nodes[ids.url].style?.color).toBe("var(--color-red)");
    expect(loaded.content).toContain("color=var(--color-red)");
    expect(loaded.warnings).toEqual([]);
  });

  it("throws on a corrupted state block without touching the file", () => {
    const { content } = populatedContent();

    expect(() => loadDocument(content.replace('"v": 1', '"v": '))).toThrow();
  });

  it("rebuildDocument replaces a broken state block with one rebuilt from the body", () => {
    const { content, ids } = populatedContent();
    const broken = content.replace('"v": 1', '"v": ');
    const rebuilt = rebuildDocument(broken);

    expect(rebuilt.warnings).toContain("rebuilt-state");
    expect(rebuilt.state.nodes[ids.note]).toBeDefined();
    expect(readState(rebuilt.content)?.nodes[ids.note]).toBeDefined();
  });

  it("keeps text node source ids stable across repeated rebuilds", () => {
    const { content, ids } = populatedContent();
    const stripped = stripStateBlock(content);
    const first = rebuildState(stripped);
    const second = rebuildState(stripped);
    const sourceOf = (state: typeof first): unknown => state.nodes[ids.text].source;

    expect(sourceOf(first)).toEqual(sourceOf(second));
  });
});
