import { asSide, createEdge } from "../domain/create";
import type {
  EdgeDirection,
  EdgeLine,
  RoadmapEdge,
  RoadmapNode,
  RoadmapState,
  TextAlign,
  TextAlignH,
  TextAlignV,
} from "../domain/types";
import { insertNodeBlock, removeNodeBlock, writeRelations, writeState } from "./document";

interface Snapshot {
  state: RoadmapState;
  content: string;
}

const HISTORY_LIMIT = 200;

/**
 * In-memory roadmap state plus its serialized file content. Mutations produce new
 * immutable state snapshots and keep the content in sync so the view can persist the
 * latest text. Layout-only changes touch just the hidden state block; structural
 * changes also update the readable Markdown body (node markers and `## Relations`).
 *
 * Each mutation records the prior snapshot so `undo`/`redo` can step through the edit
 * history. Snapshots are cheap to keep because state and content are replaced wholesale
 * rather than mutated in place.
 */
export class RoadmapSession {
  private stateValue: RoadmapState;
  private contentValue: string;
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];

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

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private begin(): void {
    this.undoStack.push({ state: this.stateValue, content: this.contentValue });
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (prev === undefined) {
      return false;
    }
    this.redoStack.push({ state: this.stateValue, content: this.contentValue });
    this.stateValue = prev.state;
    this.contentValue = prev.content;

    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) {
      return false;
    }
    this.undoStack.push({ state: this.stateValue, content: this.contentValue });
    this.stateValue = next.state;
    this.contentValue = next.content;

    return true;
  }

  addNode(node: RoadmapNode): void {
    this.begin();
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [node.id]: node },
    };
    this.contentValue = writeState(insertNodeBlock(this.contentValue, node), this.stateValue);
  }

  addNodes(nodes: readonly RoadmapNode[]): void {
    if (nodes.length === 0) {
      return;
    }
    this.begin();
    let content = this.contentValue;
    const next = { ...this.stateValue.nodes };
    for (const node of nodes) {
      next[node.id] = node;
      content = insertNodeBlock(content, node);
    }
    this.stateValue = { ...this.stateValue, nodes: next };
    this.contentValue = writeState(content, this.stateValue);
  }

  moveNode(id: string, x: number, y: number): void {
    this.moveNodes([{ id, x, y }]);
  }

  moveNodes(moves: ReadonlyArray<{ id: string; x: number; y: number }>): void {
    const nodes = { ...this.stateValue.nodes };
    let changed = false;
    for (const { id, x, y } of moves) {
      const node = nodes[id];
      if (node === undefined) {
        continue;
      }
      nodes[id] = { ...node, layout: { ...node.layout, x, y } };
      changed = true;
    }
    if (!changed) {
      return;
    }
    this.begin();
    this.stateValue = { ...this.stateValue, nodes };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  resizeNode(id: string, width: number, height: number, x: number, y: number): void {
    const node = this.stateValue.nodes[id];
    if (node === undefined) {
      return;
    }
    this.begin();
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [id]: { ...node, layout: { x, y, width, height } } },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  setNodeAlign(id: string, patch: { h?: TextAlignH; v?: TextAlignV }): void {
    const node = this.stateValue.nodes[id];
    if (node === undefined) {
      return;
    }
    const current = node.align ?? { h: "left", v: "middle" };
    const align: TextAlign = { h: patch.h ?? current.h, v: patch.v ?? current.v };
    this.begin();
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [id]: { ...node, align } },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  deleteNode(id: string): void {
    this.deleteNodes([id]);
  }

  deleteNodes(ids: readonly string[]): void {
    const present = ids.filter((id) => this.stateValue.nodes[id] !== undefined);
    if (present.length === 0) {
      return;
    }
    this.begin();
    let content = this.contentValue;
    const nodes = { ...this.stateValue.nodes };
    for (const id of present) {
      delete nodes[id];
      content = removeNodeBlock(content, id);
    }
    const removed = new Set(present);
    const edges: Record<string, RoadmapEdge> = {};
    for (const [edgeId, edge] of Object.entries(this.stateValue.edges)) {
      if (!removed.has(endpointNodeId(edge.from)) && !removed.has(endpointNodeId(edge.to))) {
        edges[edgeId] = edge;
      }
    }
    this.stateValue = { ...this.stateValue, nodes, edges };
    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
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
    this.begin();
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
    this.deleteEdges([id]);
  }

  deleteEdges(ids: readonly string[]): void {
    const present = ids.filter((id) => this.stateValue.edges[id] !== undefined);
    if (present.length === 0) {
      return;
    }
    this.begin();
    const edges = { ...this.stateValue.edges };
    for (const id of present) {
      delete edges[id];
    }
    this.stateValue = { ...this.stateValue, edges };
    this.contentValue = writeRelations(
      writeState(this.contentValue, this.stateValue),
      this.stateValue,
    );
  }

  deleteElements(nodeIds: readonly string[], edgeIds: readonly string[]): void {
    const removed = new Set(nodeIds.filter((id) => this.stateValue.nodes[id] !== undefined));
    const droppedEdges = new Set(edgeIds.filter((id) => this.stateValue.edges[id] !== undefined));
    for (const [edgeId, edge] of Object.entries(this.stateValue.edges)) {
      if (removed.has(endpointNodeId(edge.from)) || removed.has(endpointNodeId(edge.to))) {
        droppedEdges.add(edgeId);
      }
    }
    if (removed.size === 0 && droppedEdges.size === 0) {
      return;
    }
    this.begin();
    let content = this.contentValue;
    const nodes = { ...this.stateValue.nodes };
    for (const id of removed) {
      delete nodes[id];
      content = removeNodeBlock(content, id);
    }
    const edges = { ...this.stateValue.edges };
    for (const id of droppedEdges) {
      delete edges[id];
    }
    this.stateValue = { ...this.stateValue, nodes, edges };
    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
  }

  updateEdge(id: string, patch: { direction?: EdgeDirection; line?: EdgeLine | "solid" }): void {
    const edge = this.stateValue.edges[id];
    if (edge === undefined) {
      return;
    }
    this.begin();
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

function endpointNodeId(endpoint: RoadmapEdge["from"]): string {
  return endpoint.type === "node" ? endpoint.id : "";
}
