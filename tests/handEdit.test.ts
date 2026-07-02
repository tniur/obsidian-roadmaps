import { describe, expect, it } from "vitest";
import { createNoteNode, createUrlNode } from "../src/domain/create";
import { createRoadmapDocument, readState } from "../src/state/document";
import { adoptNodeMarkers, adoptRelationEdges, ensureClusterMarkers, reconcileState } from "../src/state/reconcile";
import { RoadmapSession } from "../src/state/session";

function freshSession(): RoadmapSession {
  const content = createRoadmapDocument("Board");
  const state = readState(content);

  if (state === null) {
    throw new Error("expected a state block");
  }

  return new RoadmapSession(state, content);
}

describe("hand edits reconciled back into state", () => {
  it("is idempotent on content the plugin wrote itself", () => {
    const session = freshSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNodes([a, b]);
    session.updateNodeMeta(a.id, { title: "Custom", status: "done" });
    session.addEdge(a.id, b.id);

    const state = readState(session.content);

    expect(state).not.toBeNull();

    if (state === null) {
      return;
    }

    expect(reconcileState(state, session.content)).toBe(state);
  });

  it("applies an edited wikilink target, alias and tags to the node", () => {
    const session = freshSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);
    const edited = session.content.replace("- [ ] [[notes/a|a]]", "- [ ] [[notes/b|Renamed]] #in-progress #high");
    const reconciled = reconcileState(readState(edited) ?? session.state, edited);
    const next = reconciled.nodes[node.id];

    expect(next.source).toEqual({ type: "note", file: "notes/b.md" });
    expect(next.title).toBe("Renamed");
    expect(next.status).toBe("in-progress");
    expect(next.priority).toBe("high");
  });

  it("clears status when its tag is removed by hand", () => {
    const session = freshSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);
    session.updateNodeMeta(node.id, { status: "done" });
    const edited = session.content.replace("[[notes/a|a]] #done", "[[notes/a|a]]");
    const reconciled = reconcileState(readState(edited) ?? session.state, edited);

    expect(reconciled.nodes[node.id].status).toBeUndefined();
  });

  it("adds a description line written under a node block", () => {
    const session = freshSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);
    const edited = session.content.replace("- [ ] [[notes/a|a]]", "- [ ] [[notes/a|a]]\nHand-written details");
    const reconciled = reconcileState(readState(edited) ?? session.state, edited);

    expect(reconciled.nodes[node.id].description).toBe("Hand-written details");
  });
});

describe("hand-written cluster headings", () => {
  it("adds markers to unmarked headings and leaves reserved sections alone", () => {
    const content = [
      "---",
      "roadmap-plugin: board",
      "---",
      "",
      "# Board",
      "",
      "## My Cluster",
      "",
      "## Relations",
      "",
    ].join("\n");
    const marked = ensureClusterMarkers(content);

    expect(marked).toMatch(/## My Cluster <!-- roadmap-cluster:id=\S+ -->/);
    expect(marked).toContain("## Relations\n");
    expect(marked).not.toMatch(/## Relations <!--/);
  });

  it("turns a hand-written heading into a cluster arranged around its nodes", () => {
    const session = freshSession();
    const a = createNoteNode("notes/a.md", { x: 500, y: 400 });
    const b = createNoteNode("notes/b.md", { x: 900, y: 700 });

    session.addNodes([a, b]);
    const blockA = `<!-- roadmap-node:id=${a.id} type=note -->\n- [ ] [[notes/a|a]]`;
    const edited = session.content.replace(blockA, `## Stage 1\n\n${blockA}`);
    const marked = ensureClusterMarkers(edited);
    const reconciled = reconcileState(readState(marked) ?? session.state, marked);
    const clusters = Object.values(reconciled.clusters);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].title).toBe("Stage 1");

    const members = Object.values(reconciled.nodes).filter((node) => node.clusterId === clusters[0].id);

    expect(members.map((node) => node.id).sort()).toEqual([a.id, b.id].sort());

    const box = clusters[0].layout;

    expect(box.x).toBe(500 - 32);
    expect(box.y).toBe(400 - 32);

    for (const member of members) {
      expect(member.layout.x).toBeGreaterThanOrEqual(0);
      expect(member.layout.y).toBeGreaterThanOrEqual(0);
      expect(member.layout.x + member.layout.width).toBeLessThanOrEqual(box.width);
      expect(member.layout.y + member.layout.height).toBeLessThanOrEqual(box.height);
    }
  });
});

describe("hand-written node blocks with a marker", () => {
  it("adopts a pasted marked block as a new node with parsed content", () => {
    const session = freshSession();
    const existing = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(existing);
    const pasted = [
      "<!-- roadmap-node:id=pasted-node-1 type=note -->",
      "- [ ] [[notes/pasted|Pasted]] #done #high",
    ].join("\n");
    const edited = session.content.replace("# Board", `# Board\n\n${pasted}`);
    const state = readState(edited) ?? session.state;
    const adopted = adoptNodeMarkers(reconcileState(state, edited), edited);
    const node = adopted.nodes["pasted-node-1"];

    expect(node).toBeDefined();
    expect(node.source).toEqual({ type: "note", file: "notes/pasted.md" });
    expect(node.title).toBe("Pasted");
    expect(node.status).toBe("done");
    expect(node.priority).toBe("high");
    expect(adopted.nodes[existing.id]).toBeDefined();
  });

  it("adopts a marked block under a cluster heading as a member", () => {
    const session = freshSession();
    const member = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(member);
    session.createClusterFromNodes([member.id], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];
    const heading = session.content.match(/^## Group <!--[^\n]*$/m)?.[0];

    if (heading === undefined) {
      throw new Error("expected the cluster heading");
    }

    const pasted = `<!-- roadmap-node:id=pasted-node-2 type=note -->\n- [ ] [[notes/pasted|Pasted]]`;
    const edited = session.content.replace(heading, `${heading}\n\n${pasted}`);
    const state = readState(edited) ?? session.state;
    const adopted = adoptNodeMarkers(reconcileState(state, edited), edited);

    expect(adopted.nodes["pasted-node-2"]?.clusterId).toBe(clusterId);
  });

  it("ignores markers with an unknown kind", () => {
    const session = freshSession();
    const pasted = `<!-- roadmap-node:id=pasted-node-3 type=banana -->\n- [ ] [[notes/x|X]]`;
    const edited = session.content.replace("# Board", `# Board\n\n${pasted}`);
    const state = readState(edited) ?? session.state;
    const adopted = adoptNodeMarkers(reconcileState(state, edited), edited);

    expect(adopted.nodes["pasted-node-3"]).toBeUndefined();
  });
});

describe("hand-written relation lines", () => {
  it("adopts a markerless line as a new edge", () => {
    const session = freshSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createUrlNode("https://example.com", { x: 300, y: 0 });

    session.addNodes([a, b]);
    const edited = `${session.content.replace("%% roadmap:state", "## Relations\n\n- [[notes/a|a]] -> [example.com](https://example.com): dep\n\n%% roadmap:state")}`;
    const state = readState(edited) ?? session.state;
    const adopted = adoptRelationEdges(reconcileState(state, edited), edited);
    const edges = Object.values(adopted.edges);

    expect(edges).toHaveLength(1);
    expect(edges[0].from).toEqual({ type: "node", id: a.id });
    expect(edges[0].to).toEqual({ type: "node", id: b.id });
    expect(edges[0].direction).toBe("forward");
    expect(edges[0].label).toBe("dep");
  });

  it("does not duplicate an edge that already exists", () => {
    const session = freshSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id);
    const edited = session.content.replace("## Relations\n", "## Relations\n\n- [[notes/a|a]] -> [[notes/b|b]]\n");
    const state = readState(edited) ?? session.state;
    const adopted = adoptRelationEdges(reconcileState(state, edited), edited);

    expect(Object.keys(adopted.edges)).toHaveLength(1);
  });
});
