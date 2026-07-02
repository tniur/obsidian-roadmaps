import { nanoid } from "nanoid";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import type { EdgeSide, RoadmapCluster, RoadmapEdge, RoadmapEndpoint, RoadmapLayout, RoadmapNode } from "./types";

export interface NodePlacement {
  x: number;
  y: number;
}

export function createCluster(title: string, layout: RoadmapLayout): RoadmapCluster {
  return { id: nanoid(), title, layout };
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

export function createImageNode(filePath: string, placement: NodePlacement): RoadmapNode {
  return {
    id: nanoid(),
    kind: "image",
    source: { type: "image", file: filePath },
    layout: {
      x: placement.x,
      y: placement.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    },
  };
}

export function createAttachmentNode(filePath: string, placement: NodePlacement): RoadmapNode {
  return {
    id: nanoid(),
    kind: "attachment",
    source: { type: "attachment", file: filePath },
    layout: {
      x: placement.x,
      y: placement.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    },
  };
}

export function createTextNode(text: string, placement: NodePlacement): RoadmapNode {
  return {
    id: nanoid(),
    kind: "text",
    source: { type: "text", markdownNodeId: nanoid() },
    title: text,
    layout: {
      x: placement.x,
      y: placement.y,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    },
  };
}

/**
 * Clone for paste/duplicate. Cluster membership is intentionally not inherited: the body
 * places new blocks in the unclustered region, so a copy claiming a cluster would diverge
 * from it. Callers pass absolute coordinates; dragging the copy into a cluster re-joins it.
 */
export function copyNode(node: RoadmapNode, x: number, y: number): RoadmapNode {
  const copy: RoadmapNode = { ...node, id: nanoid(), layout: { ...node.layout, x, y } };

  delete copy.clusterId;

  return copy;
}

export function asSide(value: string | null | undefined): EdgeSide | undefined {
  return value === "top" || value === "right" || value === "bottom" || value === "left" ? value : undefined;
}

export function createEdge(
  from: RoadmapEndpoint,
  to: RoadmapEndpoint,
  fromSide?: EdgeSide,
  toSide?: EdgeSide,
): RoadmapEdge {
  const edge: RoadmapEdge = {
    id: nanoid(),
    from,
    to,
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
