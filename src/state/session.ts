import type { RoadmapNode, RoadmapState } from "../domain/types";
import { insertNodeBlock, removeNodeBlock, writeState } from "./document";

/**
 * In-memory roadmap state plus its serialized file content. Mutations produce new
 * immutable state snapshots and keep the content in sync so the view can persist the
 * latest text. Layout-only changes touch just the hidden state block; structural
 * changes also update the readable Markdown body.
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
    this.stateValue = { ...this.stateValue, nodes };
    this.contentValue = writeState(removeNodeBlock(this.contentValue, id), this.stateValue);
  }
}
