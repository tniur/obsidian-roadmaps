import { nanoid } from "nanoid";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import type { EdgeSide, RoadmapEdge, RoadmapNode } from "./types";

export interface NodePlacement {
  x: number;
  y: number;
}

export function createNoteNode(filePath: string, placement: NodePlacement): RoadmapNode {
  return {
    id: nanoid(),
    kind: "note",
    source: { type: "note", file: filePath },
    layout: {
      x: placement.x,
      y: placement.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    },
  };
}

export function createUrlNode(url: string, placement: NodePlacement): RoadmapNode {
  return {
    id: nanoid(),
    kind: "url",
    source: { type: "url", url },
    layout: {
      x: placement.x,
      y: placement.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    },
  };
}

export function copyNode(node: RoadmapNode, x: number, y: number): RoadmapNode {
  return { ...node, id: nanoid(), layout: { ...node.layout, x, y } };
}

export function asSide(value: string | null | undefined): EdgeSide | undefined {
  return value === "top" || value === "right" || value === "bottom" || value === "left"
    ? value
    : undefined;
}

export function createEdge(
  fromNodeId: string,
  toNodeId: string,
  fromSide?: EdgeSide,
  toSide?: EdgeSide,
): RoadmapEdge {
  const edge: RoadmapEdge = {
    id: nanoid(),
    from: { type: "node", id: fromNodeId },
    to: { type: "node", id: toNodeId },
    direction: "forward",
  };
  if (fromSide !== undefined) {
    edge.fromSide = fromSide;
  }
  if (toSide !== undefined) {
    edge.toSide = toSide;
  }

  return edge;
}
