import { describe, expect, it } from "vitest";
import { createNoteNode } from "../src/domain/create";
import { createRoadmapDocument, readState } from "../src/state/document";
import { RoadmapSession } from "../src/state/session";

function newSession(): RoadmapSession {
  const content = createRoadmapDocument("R");
  const state = readState(content);
  if (state === null) {
    throw new Error("expected a state block");
  }

  return new RoadmapSession(state, content);
}

describe("roadmap session", () => {
  it("adds a node to state, body and state block without mutating the prior snapshot", () => {
    const session = newSession();
    const before = session.state;
    const node = createNoteNode("notes/a.md", { x: 1, y: 2 });
    session.addNode(node);

    expect(session.state.nodes[node.id]).toBeDefined();
    expect(before.nodes[node.id]).toBeUndefined();
    expect(session.content).toContain(`id=${node.id}`);
    expect(readState(session.content)?.nodes[node.id]?.source).toEqual({
      type: "note",
      file: "notes/a.md",
    });
  });

  it("deletes a node from state, body and state block", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 1, y: 2 });
    session.addNode(node);
    session.deleteNode(node.id);

    expect(session.state.nodes[node.id]).toBeUndefined();
    expect(session.content).not.toContain(`id=${node.id}`);
    expect(readState(session.content)?.nodes[node.id]).toBeUndefined();
  });

  it("moves a node without touching the readable body", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 1, y: 2 });
    session.addNode(node);
    const bodyBefore = session.content.split("%% roadmap:state")[0];
    session.moveNode(node.id, 40, 50);

    expect(session.state.nodes[node.id]?.layout).toMatchObject({ x: 40, y: 50 });
    expect(session.content.split("%% roadmap:state")[0]).toBe(bodyBefore);
    expect(readState(session.content)?.nodes[node.id]?.layout.x).toBe(40);
  });
});
