import { nanoid } from "nanoid";
import { z } from "zod";
import { ROADMAP_SCHEMA_VERSION } from "../constants";
import { isHexColor, normalizeHexColor } from "./palette";
import { fileKindForPath } from "./paths";
import type {
  EdgeDirection,
  RoadmapCluster,
  RoadmapEdge,
  RoadmapEndpoint,
  RoadmapNode,
  RoadmapNodeSource,
  RoadmapState,
} from "./types";

/**
 * Bridge to the JSON Canvas format (jsoncanvas.org), the native Obsidian Canvas file.
 * The mapping is intentionally lossy: it round-trips node kinds, layout, edges, groups and
 * a best-effort color, but roadmap-only meta (status, priority, description, text alignment,
 * edge line style) has no place in the standard and is dropped on export.
 */

const canvasSide = z.enum(["top", "right", "bottom", "left"]);

const canvasEnd = z.enum(["none", "arrow"]);

const canvasNodeSchema = z
  .object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    type: z.enum(["text", "file", "link", "group"]),
    text: z.string().optional(),
    file: z.string().optional(),
    url: z.string().optional(),
    label: z.string().optional(),
    color: z.string().optional(),
  })
  .passthrough();

const canvasEdgeSchema = z
  .object({
    id: z.string(),
    fromNode: z.string(),
    toNode: z.string(),
    fromSide: canvasSide.optional(),
    toSide: canvasSide.optional(),
    fromEnd: canvasEnd.optional(),
    toEnd: canvasEnd.optional(),
    label: z.string().optional(),
    color: z.string().optional(),
  })
  .passthrough();

const canvasSchema = z
  .object({
    nodes: z.array(canvasNodeSchema).default([]),
    edges: z.array(canvasEdgeSchema).default([]),
  })
  .passthrough();

export type JsonCanvas = z.infer<typeof canvasSchema>;

type CanvasNode = z.infer<typeof canvasNodeSchema>;

type CanvasEdge = z.infer<typeof canvasEdgeSchema>;

export function parseCanvas(text: string): JsonCanvas {
  return canvasSchema.parse(JSON.parse(text));
}

export function serializeCanvas(canvas: JsonCanvas): string {
  return `${JSON.stringify(canvas, null, 2)}\n`;
}

/**
 * Roadmap theme color to the closest Canvas preset ("1".."6"); blue/pink fold onto
 * neighbors. Custom hex colors skip the preset tables entirely: the standard accepts
 * hex in the same field, so they cross both ways verbatim.
 */
const CANVAS_COLOR_BY_VAR: Record<string, string> = {
  "var(--color-red)": "1",
  "var(--color-orange)": "2",
  "var(--color-yellow)": "3",
  "var(--color-green)": "4",
  "var(--color-cyan)": "5",
  "var(--color-blue)": "5",
  "var(--color-purple)": "6",
  "var(--color-pink)": "6",
};

const VAR_BY_CANVAS_COLOR: Record<string, string> = {
  "1": "var(--color-red)",
  "2": "var(--color-orange)",
  "3": "var(--color-yellow)",
  "4": "var(--color-green)",
  "5": "var(--color-cyan)",
  "6": "var(--color-purple)",
};

function toCanvasColor(color: string | undefined): string | undefined {
  if (color === undefined) {
    return undefined;
  }

  return isHexColor(color) ? color : CANVAS_COLOR_BY_VAR[color];
}

function toVarColor(color: string | undefined): string | undefined {
  if (color === undefined) {
    return undefined;
  }

  return isHexColor(color) ? normalizeHexColor(color) : VAR_BY_CANVAS_COLOR[color];
}

function absolutePosition(state: RoadmapState, node: RoadmapNode): { x: number; y: number } {
  const cluster = node.clusterId == null ? undefined : state.clusters[node.clusterId];

  return { x: (cluster?.layout.x ?? 0) + node.layout.x, y: (cluster?.layout.y ?? 0) + node.layout.y };
}

type CanvasNodePayload = Pick<CanvasNode, "type"> & Partial<Pick<CanvasNode, "text" | "file" | "url">>;

function canvasNodePayload(source: RoadmapNodeSource, title: string | undefined): CanvasNodePayload {
  switch (source.type) {
    case "text":
      return { type: "text", text: title ?? "" };
    case "url":
      return { type: "link", url: source.url };
    default:
      return { type: "file", file: source.file };
  }
}

function arrowEnds(direction: EdgeDirection): Pick<CanvasEdge, "fromEnd" | "toEnd"> {
  if (direction === "both") {
    return { fromEnd: "arrow", toEnd: "arrow" };
  }

  return direction === "forward" ? { fromEnd: "none", toEnd: "arrow" } : { fromEnd: "none", toEnd: "none" };
}

function nodeToCanvas(state: RoadmapState, node: RoadmapNode): CanvasNode {
  const position = absolutePosition(state, node);
  const canvasNode: CanvasNode = {
    id: node.id,
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: node.layout.width,
    height: node.layout.height,
    ...canvasNodePayload(node.source, node.title),
  };
  const color = toCanvasColor(node.style?.color);

  if (color !== undefined) {
    canvasNode.color = color;
  }

  return canvasNode;
}

function clusterToCanvas(cluster: RoadmapCluster): CanvasNode {
  const canvasNode: CanvasNode = {
    id: cluster.id,
    x: Math.round(cluster.layout.x),
    y: Math.round(cluster.layout.y),
    width: cluster.layout.width,
    height: cluster.layout.height,
    type: "group",
    label: cluster.title,
  };
  const color = toCanvasColor(cluster.style?.color);

  if (color !== undefined) {
    canvasNode.color = color;
  }

  return canvasNode;
}

function edgeToCanvas(edge: RoadmapEdge): CanvasEdge {
  const canvasEdge: CanvasEdge = {
    id: edge.id,
    fromNode: edge.from.id,
    toNode: edge.to.id,
    ...arrowEnds(edge.direction),
  };
  const color = toCanvasColor(edge.style?.color);

  if (edge.fromSide !== undefined) canvasEdge.fromSide = edge.fromSide;
  if (edge.toSide !== undefined) canvasEdge.toSide = edge.toSide;
  if (edge.label !== undefined && edge.label.length > 0) canvasEdge.label = edge.label;
  if (color !== undefined) canvasEdge.color = color;

  return canvasEdge;
}

export function roadmapToCanvas(state: RoadmapState): JsonCanvas {
  return {
    nodes: [
      ...Object.values(state.nodes).map((node) => nodeToCanvas(state, node)),
      ...Object.values(state.clusters).map(clusterToCanvas),
    ],
    edges: Object.values(state.edges).map(edgeToCanvas),
  };
}

function sourceFromCanvas(node: CanvasNode): { source: RoadmapNodeSource; kind: RoadmapNode["kind"] } | null {
  if (node.type === "text") {
    return { source: { type: "text" }, kind: "text" };
  }

  if (node.type === "link") {
    return node.url === undefined ? null : { source: { type: "url", url: node.url }, kind: "url" };
  }

  if (node.file === undefined) {
    return null;
  }

  switch (fileKindForPath(node.file)) {
    case "image":
      return { source: { type: "image", file: node.file }, kind: "image" };
    case "attachment":
      return { source: { type: "attachment", file: node.file }, kind: "attachment" };
    default:
      return { source: { type: "note", file: node.file }, kind: "note" };
  }
}

interface GroupRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Smallest group whose rectangle contains the point; null when the point is free. */
function containingGroup(groups: readonly GroupRect[], point: { x: number; y: number }): GroupRect | null {
  let best: GroupRect | null = null;

  for (const group of groups) {
    const inside =
      point.x >= group.x && point.x <= group.x + group.width && point.y >= group.y && point.y <= group.y + group.height;

    if (inside && (best === null || group.width * group.height < best.width * best.height)) {
      best = group;
    }
  }

  return best;
}

function directionFromEnds(edge: CanvasEdge): { direction: EdgeDirection; reversed: boolean } {
  const fromArrow = edge.fromEnd === "arrow";
  const toArrow = edge.toEnd === undefined ? true : edge.toEnd === "arrow";

  if (fromArrow && toArrow) {
    return { direction: "both", reversed: false };
  }

  if (toArrow) {
    return { direction: "forward", reversed: false };
  }

  return fromArrow ? { direction: "forward", reversed: true } : { direction: "none", reversed: false };
}

interface CanvasNodes {
  idMap: Map<string, string>;
  clusters: Record<string, RoadmapCluster>;
  groups: GroupRect[];
  /** Nodes awaiting geometric membership, with their absolute (pre-rebase) position. */
  pending: { node: RoadmapNode; absolute: { x: number; y: number } }[];
}

/** Turns canvas nodes into clusters and pending roadmap nodes, regenerating stable ids. */
function readCanvasNodes(canvas: JsonCanvas): CanvasNodes {
  const idMap = new Map<string, string>();
  const clusters: Record<string, RoadmapCluster> = {};
  const groups: GroupRect[] = [];
  const pending: CanvasNodes["pending"] = [];

  for (const canvasNode of canvas.nodes) {
    const id = nanoid();
    const layout = { x: canvasNode.x, y: canvasNode.y, width: canvasNode.width, height: canvasNode.height };
    const color = toVarColor(canvasNode.color);

    idMap.set(canvasNode.id, id);

    if (canvasNode.type === "group") {
      const cluster: RoadmapCluster = { id, title: canvasNode.label ?? "Group", layout };

      if (color !== undefined) cluster.style = { color };
      clusters[id] = cluster;
      groups.push({ id, ...layout });
      continue;
    }

    const mapped = sourceFromCanvas(canvasNode);

    if (mapped === null) {
      idMap.delete(canvasNode.id);
      continue;
    }

    const node: RoadmapNode = { id, kind: mapped.kind, source: mapped.source, layout };

    if (canvasNode.type === "text" && canvasNode.text !== undefined && canvasNode.text.length > 0) {
      node.title = canvasNode.text;
    }

    if (color !== undefined) node.style = { color };
    pending.push({ node, absolute: { x: layout.x, y: layout.y } });
  }

  return { idMap, clusters, groups, pending };
}

/** Assigns each pending node to the smallest group its center falls in, rebasing to relative. */
function assignMembership(pending: CanvasNodes["pending"], groups: readonly GroupRect[]): Record<string, RoadmapNode> {
  const nodes: Record<string, RoadmapNode> = {};

  for (const { node, absolute } of pending) {
    const center = { x: absolute.x + node.layout.width / 2, y: absolute.y + node.layout.height / 2 };
    const group = containingGroup(groups, center);

    if (group !== null) {
      node.clusterId = group.id;
      node.layout = { ...node.layout, x: absolute.x - group.x, y: absolute.y - group.y };
    }

    nodes[node.id] = node;
  }

  return nodes;
}

function readCanvasEdges(
  canvas: JsonCanvas,
  idMap: ReadonlyMap<string, string>,
  clusters: Record<string, RoadmapCluster>,
): Record<string, RoadmapEdge> {
  const endpointFor = (id: string): RoadmapEndpoint => ({ type: id in clusters ? "cluster" : "node", id });
  const edges: Record<string, RoadmapEdge> = {};

  for (const canvasEdge of canvas.edges) {
    const fromId = idMap.get(canvasEdge.fromNode);
    const toId = idMap.get(canvasEdge.toNode);

    if (fromId === undefined || toId === undefined || fromId === toId) {
      continue;
    }

    const { direction, reversed } = directionFromEnds(canvasEdge);
    const id = nanoid();
    const edge: RoadmapEdge = {
      id,
      from: endpointFor(reversed ? toId : fromId),
      to: endpointFor(reversed ? fromId : toId),
      direction,
    };
    const fromSide = reversed ? canvasEdge.toSide : canvasEdge.fromSide;
    const toSide = reversed ? canvasEdge.fromSide : canvasEdge.toSide;

    if (fromSide !== undefined) edge.fromSide = fromSide;
    if (toSide !== undefined) edge.toSide = toSide;
    if (canvasEdge.label !== undefined && canvasEdge.label.length > 0) edge.label = canvasEdge.label;

    edges[id] = edge;
  }

  return edges;
}

/**
 * Builds a roadmap state from a parsed canvas. Ids are regenerated (canvas ids may not be
 * ours), `group` nodes become clusters with geometric membership (a node belongs to the
 * smallest group its center falls in), and file nodes are classified by extension.
 */
export function canvasToState(canvas: JsonCanvas): RoadmapState {
  const { idMap, clusters, groups, pending } = readCanvasNodes(canvas);
  const nodes = assignMembership(pending, groups);
  const edges = readCanvasEdges(canvas, idMap, clusters);

  return { schemaVersion: ROADMAP_SCHEMA_VERSION, id: nanoid(), nodes, clusters, edges };
}
