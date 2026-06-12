export type RoadmapNodeKind =
  | "note"
  | "heading"
  | "block"
  | "text"
  | "image"
  | "attachment"
  | "url";

export type RoadmapNodeSource =
  | { type: "note"; file: string }
  | { type: "heading"; file: string; heading: string }
  | { type: "block"; file: string; blockId: string }
  | { type: "text"; markdownNodeId: string }
  | { type: "image"; file: string }
  | { type: "attachment"; file: string }
  | { type: "url"; url: string };

export type RoadmapStatus = "draft" | "in-progress" | "done" | "archived";

export type RoadmapPriority = "low" | "medium" | "high" | "critical";

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
  style?: { color?: string; icon?: string };
}

export interface RoadmapCluster {
  id: string;
  title: string;
  source?: RoadmapNodeSource;
  layout: RoadmapLayout;
  style?: { color?: string };
  collapsed?: boolean;
}

export type RoadmapEndpoint = { type: "node" | "cluster"; id: string };

export type EdgeDirection = "none" | "forward" | "both";

export type EdgeSide = "top" | "right" | "bottom" | "left";

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
