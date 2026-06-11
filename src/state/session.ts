import { asSide, createEdge } from "../domain/create";
import type {
  EdgeDirection,
  EdgeLine,
  RoadmapEdge,
  RoadmapNode,
  RoadmapState,
} from "../domain/types";
import { insertNodeBlock, removeNodeBlock, writeRelations, writeState } from "./document";

/**
 * In-memory roadmap state plus its serialized file content. Mutations produce new
 * immutable state snapshots and keep the content in sync so the view can persist the
 * latest text. Layout-only changes touch just the hidden state block; structural
 * changes also update the readable Markdown body (node markers and `## Relations`).
 */
export class RoadmapSession {
  private stateValue: RoadmapState;
  private contentValue: string;

  constructor(state: RoadmapState, content: string) {
    this.stateValue = state;
    this.contentValue = content;
  }

  get state(): RoadmapState {
    return this.stateValue;
  }

  get content(): string {
    return this.contentValue;
  }

  addNode(node: RoadmapNode): void {
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [node.id]: node },
    };
    this.contentValue = writeState(insertNodeBlock(this.contentValue, node), this.stateValue);
  }

  moveNode(id: string, x: number, y: number): void {
    const node = this.stateValue.nodes[id];
    if (node === undefined) {
      return;
    }
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [id]: { ...node, layout: { ...node.layout, x, y } } },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  deleteNode(id: string): void {
    if (this.stateValue.nodes[id] === undefined) {
      return;
    }
    const nodes = { ...this.stateValue.nodes };
    delete nodes[id];
    const edges: Record<string, RoadmapEdge> = {};
    for (const [edgeId, edge] of Object.entries(this.stateValue.edges)) {
      if (!touchesNode(edge, id)) {
        edges[edgeId] = edge;
      }
    }
    this.stateValue = { ...this.stateValue, nodes, edges };
    this.contentValue = writeRelations(
      writeState(removeNodeBlock(this.contentValue, id), this.stateValue),
      this.stateValue,
    );
  }

  addEdge(
    fromNodeId: string,
    toNodeId: string,
    fromHandle?: string | null,
    toHandle?: string | null,
  ): void {
    const duplicate = Object.values(this.stateValue.edges).some(
      (edge) =>
        edge.from.type === "node" &&
        edge.to.type === "node" &&
        edge.from.id === fromNodeId &&
        edge.to.id === toNodeId,
    );
    if (duplicate) {
      return;
    }
    const edge = createEdge(fromNodeId, toNodeId, asSide(fromHandle), asSide(toHandle));
    this.stateValue = {
      ...this.stateValue,
      edges: { ...this.stateValue.edges, [edge.id]: edge },
    };
    this.contentValue = writeRelations(
      writeState(this.contentValue, this.stateValue),
      this.stateValue,
    );
  }

  deleteEdge(id: string): void {
    if (this.stateValue.edges[id] === undefined) {
      return;
    }
    const edges = { ...this.stateValue.edges };
    delete edges[id];
    this.stateValue = { ...this.stateValue, edges };
    this.contentValue = writeRelations(
      writeState(this.contentValue, this.stateValue),
      this.stateValue,
    );
  }

  updateEdge(id: string, patch: { direction?: EdgeDirection; line?: EdgeLine | "solid" }): void {
    const edge = this.stateValue.edges[id];
    if (edge === undefined) {
      return;
    }
    const next: RoadmapEdge = { ...edge };
    if (patch.direction !== undefined) {
      next.direction = patch.direction;
    }
    if (patch.line !== undefined) {
      const style = { ...edge.style };
      if (patch.line === "solid") {
        delete style.line;
      } else {
        style.line = patch.line;
      }
      next.style = Object.keys(style).length > 0 ? style : undefined;
    }
    this.stateValue = { ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } };
    this.contentValue = writeRelations(
      writeState(this.contentValue, this.stateValue),
      this.stateValue,
    );
  }
}

function touchesNode(edge: RoadmapEdge, nodeId: string): boolean {
  return (
    (edge.from.type === "node" && edge.from.id === nodeId) ||
    (edge.to.type === "node" && edge.to.id === nodeId)
  );
}
