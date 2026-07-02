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

export type TextAlignH = "left" | "center" | "right";

export type TextAlignV = "top" | "middle" | "bottom";

export interface TextAlign {
  h: TextAlignH;
  v: TextAlignV;
}

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

export type EdgeLine = "dashed" | "dotted";

export interface RoadmapEdge {
  id: string;
  from: RoadmapEndpoint;
  to: RoadmapEndpoint;
  direction: EdgeDirection;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  label?: string;
  style?: { color?: string; line?: EdgeLine };
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
