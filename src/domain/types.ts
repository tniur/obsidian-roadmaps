export const ROADMAP_NODE_KINDS = ["note", "heading", "block", "text", "image", "attachment", "url"] as const;

export type RoadmapNodeKind = (typeof ROADMAP_NODE_KINDS)[number];

export function isNodeKind(value: string): value is RoadmapNodeKind {
  return (ROADMAP_NODE_KINDS as readonly string[]).includes(value);
}

export type RoadmapNodeSource =
  | { type: "note"; file: string }
  | { type: "heading"; file: string; heading: string }
  | { type: "block"; file: string; blockId: string }
  | { type: "text" }
  | { type: "image"; file: string }
  | { type: "attachment"; file: string }
  | { type: "url"; url: string };

export const ROADMAP_STATUSES = ["draft", "in-progress", "done", "archived"] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const ROADMAP_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type RoadmapPriority = (typeof ROADMAP_PRIORITIES)[number];

export const TEXT_ALIGNS_H = ["left", "center", "right"] as const;

export type TextAlignH = (typeof TEXT_ALIGNS_H)[number];

export const TEXT_ALIGNS_V = ["top", "middle", "bottom"] as const;

export type TextAlignV = (typeof TEXT_ALIGNS_V)[number];

export interface TextAlign {
  h: TextAlignH;
  v: TextAlignV;
}

/** Alignment assumed wherever a node carries no explicit `align`; never persisted. */
export const DEFAULT_TEXT_ALIGN: Readonly<TextAlign> = { h: "left", v: "top" };

export interface RoadmapLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoadmapNode {
  id: string;
  kind: RoadmapNodeKind;
  source: RoadmapNodeSource;
  title?: string;
  description?: string;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
  align?: TextAlign;
  clusterId?: string | null;
  layout: RoadmapLayout;
  style?: { color?: string };
}

export interface RoadmapCluster {
  id: string;
  title: string;
  layout: RoadmapLayout;
  style?: { color?: string };
  collapsed?: boolean;
}

export type RoadmapEndpoint = { type: "node" | "cluster"; id: string };

export type EdgeDirection = "none" | "forward" | "both";

export const EDGE_SIDES = ["top", "right", "bottom", "left"] as const;

export type EdgeSide = (typeof EDGE_SIDES)[number];

export const EDGE_LINES = ["dashed", "dotted"] as const;

export type EdgeLine = (typeof EDGE_LINES)[number];

/** Path geometry; absence means the default bezier curve. */
export const EDGE_SHAPES = ["straight", "step"] as const;

export type EdgeShape = (typeof EDGE_SHAPES)[number];

export interface RoadmapEdge {
  id: string;
  from: RoadmapEndpoint;
  to: RoadmapEndpoint;
  direction: EdgeDirection;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  label?: string;
  style?: { color?: string; line?: EdgeLine; shape?: EdgeShape };
}

export interface RoadmapViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface RoadmapState {
  schemaVersion: number;
  id: string;
  nodes: Record<string, RoadmapNode>;
  clusters: Record<string, RoadmapCluster>;
  edges: Record<string, RoadmapEdge>;
  viewport?: RoadmapViewport;
}
