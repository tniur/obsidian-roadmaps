import { describe, expect, it } from "vitest";
import { canvasToState, parseCanvas, roadmapToCanvas, serializeCanvas } from "../src/domain/jsonCanvas";
import { createNoteNode, createTextNode, createUrlNode } from "../src/domain/create";
import { createRoadmapDocument, readState } from "../src/state/document";
import { RoadmapSession } from "../src/state/session";

function newSession(): RoadmapSession {
  const content = createRoadmapDocument("Board");
  const state = readState(content);

  if (state === null) {
    throw new Error("expected a state block");
  }

  return new RoadmapSession(state, content);
}

describe("roadmapToCanvas", () => {
  it("maps node kinds to canvas node types and edges to arrows", () => {
    const session = newSession();
    const note = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const url = createUrlNode("https://example.com", { x: 300, y: 0 });
    const text = createTextNode("hello", { x: 600, y: 0 });

    session.addNodes([note, url, text]);
    session.addEdge(note.id, url.id, "right", "left");

    const canvas = roadmapToCanvas(session.state);
    const byId = new Map(canvas.nodes.map((node) => [node.id, node]));

    expect(byId.get(note.id)?.type).toBe("file");
    expect(byId.get(note.id)?.file).toBe("notes/a.md");
    expect(byId.get(url.id)?.type).toBe("link");
    expect(byId.get(text.id)?.type).toBe("text");
    expect(byId.get(text.id)?.text).toBe("hello");
    expect(canvas.edges[0]).toMatchObject({ fromNode: note.id, toNode: url.id, toEnd: "arrow", fromEnd: "none" });
  });

  it("exports clusters as groups and members at absolute positions", () => {
    const session = newSession();
    const member = createNoteNode("notes/m.md", { x: 100, y: 100 });

    session.addNodes([member]);
    session.createClusterFromNodes([member.id], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.moveClusters([{ id: clusterId, x: 500, y: 500 }]);
    const canvas = roadmapToCanvas(session.state);
    const group = canvas.nodes.find((node) => node.type === "group");
    const memberNode = canvas.nodes.find((node) => node.id === member.id);
    const relative = session.state.nodes[member.id].layout;

    expect(group).toMatchObject({ label: "Group", x: 500, y: 500 });
    expect(memberNode?.x).toBe(500 + relative.x);
    expect(memberNode?.y).toBe(500 + relative.y);
  });
});

describe("canvasToState", () => {
  it("round-trips a small board through canvas and back", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id);

    const restored = canvasToState(parseCanvas(serializeCanvas(roadmapToCanvas(session.state))));
    const nodes = Object.values(restored.nodes);
    const edges = Object.values(restored.edges);

    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.source).sort()).toEqual(
      [
        { type: "note", file: "notes/a.md" },
        { type: "note", file: "notes/b.md" },
      ].sort(),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].direction).toBe("forward");
  });

  it("assigns nodes inside a group to a cluster with relative layout", () => {
    const canvas = parseCanvas(
      JSON.stringify({
        nodes: [
          { id: "g", type: "group", label: "G", x: 0, y: 0, width: 400, height: 400 },
          { id: "n", type: "file", file: "notes/a.md", x: 100, y: 100, width: 200, height: 80 },
        ],
        edges: [],
      }),
    );

    const state = canvasToState(canvas);
    const cluster = Object.values(state.clusters)[0];
    const node = Object.values(state.nodes)[0];

    expect(cluster.title).toBe("G");
    expect(node.clusterId).toBe(cluster.id);
    expect(node.layout).toMatchObject({ x: 100, y: 100 });
  });

  it("reverses an edge whose arrow points at the from-node", () => {
    const canvas = parseCanvas(
      JSON.stringify({
        nodes: [
          { id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 80 },
          { id: "b", type: "text", text: "B", x: 300, y: 0, width: 200, height: 80 },
        ],
        edges: [{ id: "e", fromNode: "a", toNode: "b", fromEnd: "arrow", toEnd: "none" }],
      }),
    );

    const state = canvasToState(canvas);
    const edge = Object.values(state.edges)[0];
    const idByTitle = new Map(Object.values(state.nodes).map((node) => [node.title, node.id]));

    expect(edge.direction).toBe("forward");
    expect(edge.from.id).toBe(idByTitle.get("B"));
    expect(edge.to.id).toBe(idByTitle.get("A"));
  });

  it("passes custom hex colors through export and import verbatim", () => {
    const session = newSession();
    const note = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNodes([note]);
    session.updateNodeMeta(note.id, { color: "#ab12cd" });

    const canvas = roadmapToCanvas(session.state);

    expect(canvas.nodes[0].color).toBe("#ab12cd");

    const restored = canvasToState(parseCanvas(serializeCanvas(canvas)));

    expect(Object.values(restored.nodes)[0].style?.color).toBe("#ab12cd");
  });

  it("normalizes imported hex colors to lowercase", () => {
    const canvas = parseCanvas(
      JSON.stringify({
        nodes: [{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 80, color: "#AB12CD" }],
        edges: [],
      }),
    );

    expect(Object.values(canvasToState(canvas).nodes)[0].style?.color).toBe("#ab12cd");
  });

  it("ignores file nodes without a file and links without a url", () => {
    const canvas = parseCanvas(
      JSON.stringify({
        nodes: [
          { id: "a", type: "file", x: 0, y: 0, width: 100, height: 100 },
          { id: "b", type: "link", x: 0, y: 0, width: 100, height: 100 },
        ],
        edges: [],
      }),
    );

    expect(Object.keys(canvasToState(canvas).nodes)).toHaveLength(0);
  });
});
