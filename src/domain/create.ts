import { nanoid } from "nanoid";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import type { RoadmapNode } from "./types";

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
