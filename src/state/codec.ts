import type {
  EdgeDirection,
  RoadmapCluster,
  RoadmapEdge,
  RoadmapNode,
  RoadmapNodeSource,
  RoadmapState,
} from "../domain/types";
import {
  compactStateSchema,
  type CompactCluster,
  type CompactEdge,
  type CompactNode,
  type CompactSource,
  type CompactState,
} from "./compact";

function decodeSource(s: CompactSource): RoadmapNodeSource {
  switch (s[0]) {
    case "note":
      return { type: "note", file: s[1] };
    case "heading":
      return { type: "heading", file: s[1], heading: s[2] };
    case "block":
      return { type: "block", file: s[1], blockId: s[2] };
    case "text":
      return { type: "text", markdownNodeId: s[1] };
    case "image":
      return { type: "image", file: s[1] };
    case "attachment":
      return { type: "attachment", file: s[1] };
    case "url":
      return { type: "url", url: s[1] };
  }
}

function encodeSource(s: RoadmapNodeSource): CompactSource {
  switch (s.type) {
    case "note":
      return ["note", s.file];
    case "heading":
      return ["heading", s.file, s.heading];
    case "block":
      return ["block", s.file, s.blockId];
    case "text":
      return ["text", s.markdownNodeId];
    case "image":
      return ["image", s.file];
    case "attachment":
      return ["attachment", s.file];
    case "url":
      return ["url", s.url];
  }
}

function decodeNode(id: string, c: CompactNode): RoadmapNode {
  const node: RoadmapNode = {
    id,
    kind: c.k,
    source: decodeSource(c.s),
    layout: { x: c.l[0], y: c.l[1], width: c.l[2], height: c.l[3] },
  };
  if (c.t !== undefined) node.title = c.t;
  if (c.d !== undefined) node.description = c.d;
  if (c.st !== undefined) node.status = c.st;
  if (c.p !== undefined) node.priority = c.p;
  if (c.ah !== undefined || c.av !== undefined) {
    node.align = { h: c.ah ?? "left", v: c.av ?? "middle" };
  }
  if (c.cl !== undefined) node.clusterId = c.cl;
  if (c.col !== undefined || c.i !== undefined) {
    node.style = {};
    if (c.col !== undefined) node.style.color = c.col;
    if (c.i !== undefined) node.style.icon = c.i;
  }

  return node;
}

function encodeNode(node: RoadmapNode): CompactNode {
  const c: CompactNode = {
    k: node.kind,
    s: encodeSource(node.source),
    l: [node.layout.x, node.layout.y, node.layout.width, node.layout.height],
  };
  if (node.title !== undefined) c.t = node.title;
  if (node.description !== undefined) c.d = node.description;
  if (node.status !== undefined) c.st = node.status;
  if (node.priority !== undefined) c.p = node.priority;
  if (node.align !== undefined) {
    c.ah = node.align.h;
    c.av = node.align.v;
  }
  if (node.clusterId !== undefined) c.cl = node.clusterId;
  if (node.style?.color !== undefined) c.col = node.style.color;
  if (node.style?.icon !== undefined) c.i = node.style.icon;

  return c;
}

function decodeCluster(id: string, c: CompactCluster): RoadmapCluster {
  const cluster: RoadmapCluster = {
    id,
    title: c.h,
    layout: { x: c.l[0], y: c.l[1], width: c.l[2], height: c.l[3] },
  };
  if (c.col !== undefined) cluster.style = { color: c.col };
  if (c.collapsed !== undefined) cluster.collapsed = c.collapsed;

  return cluster;
}

function encodeCluster(cluster: RoadmapCluster): CompactCluster {
  const c: CompactCluster = {
    h: cluster.title,
    l: [cluster.layout.x, cluster.layout.y, cluster.layout.width, cluster.layout.height],
  };
  if (cluster.style?.color !== undefined) c.col = cluster.style.color;
  if (cluster.collapsed !== undefined) c.collapsed = cluster.collapsed;

  return c;
}

function dirFromCode(code: 0 | 1 | 2): EdgeDirection {
  return code === 0 ? "none" : code === 2 ? "both" : "forward";
}

function dirToCode(direction: EdgeDirection): 0 | 1 | 2 {
  return direction === "none" ? 0 : direction === "both" ? 2 : 1;
}

function decodeEdge(id: string, c: CompactEdge): RoadmapEdge {
  if (Array.isArray(c)) {
    return {
      id,
      from: { type: "node", id: c[0] },
      to: { type: "node", id: c[1] },
      direction: dirFromCode(c[2]),
    };
  }
  const edge: RoadmapEdge = {
    id,
    from: { type: c.from[0], id: c.from[1] },
    to: { type: c.to[0], id: c.to[1] },
    direction: dirFromCode(c.dir ?? 1),
  };
  if (c.sh !== undefined) edge.fromSide = c.sh;
  if (c.th !== undefined) edge.toSide = c.th;
  if (c.lbl !== undefined) edge.label = c.lbl;
  const line = c.ln ?? (c.dash === true ? "dashed" : undefined);
  if (c.col !== undefined || line !== undefined) {
    edge.style = {};
    if (c.col !== undefined) edge.style.color = c.col;
    if (line !== undefined) edge.style.line = line;
  }

  return edge;
}

function encodeEdge(edge: RoadmapEdge): CompactEdge {
  const bothNodes = edge.from.type === "node" && edge.to.type === "node";
  const plain =
    edge.label === undefined &&
    edge.style === undefined &&
    edge.fromSide === undefined &&
    edge.toSide === undefined;
  if (bothNodes && plain) {
    return [edge.from.id, edge.to.id, dirToCode(edge.direction)];
  }
  const c: Exclude<CompactEdge, unknown[]> = {
    from: [edge.from.type, edge.from.id],
    to: [edge.to.type, edge.to.id],
  };
  if (edge.direction !== "forward") c.dir = dirToCode(edge.direction);
  if (edge.fromSide !== undefined) c.sh = edge.fromSide;
  if (edge.toSide !== undefined) c.th = edge.toSide;
  if (edge.label !== undefined) c.lbl = edge.label;
  if (edge.style?.color !== undefined) c.col = edge.style.color;
  if (edge.style?.line !== undefined) c.ln = edge.style.line;

  return c;
}

export function decodeState(c: CompactState): RoadmapState {
  const state: RoadmapState = {
    schemaVersion: c.v,
    id: c.id,
    nodes: {},
    clusters: {},
    edges: {},
  };
  for (const [id, node] of Object.entries(c.n)) {
    state.nodes[id] = decodeNode(id, node);
  }
  for (const [id, cluster] of Object.entries(c.c)) {
    state.clusters[id] = decodeCluster(id, cluster);
  }
  for (const [id, edge] of Object.entries(c.e)) {
    state.edges[id] = decodeEdge(id, edge);
  }
  if (c.vp !== undefined) {
    state.viewport = { x: c.vp[0], y: c.vp[1], zoom: c.vp[2] };
  }

  return state;
}

export function encodeState(state: RoadmapState): CompactState {
  const c: CompactState = {
    v: state.schemaVersion,
    id: state.id,
    n: {},
    c: {},
    e: {},
  };
  for (const [id, node] of Object.entries(state.nodes)) {
    c.n[id] = encodeNode(node);
  }
  for (const [id, cluster] of Object.entries(state.clusters)) {
    c.c[id] = encodeCluster(cluster);
  }
  for (const [id, edge] of Object.entries(state.edges)) {
    c.e[id] = encodeEdge(edge);
  }
  if (state.viewport !== undefined) {
    c.vp = [state.viewport.x, state.viewport.y, state.viewport.zoom];
  }

  return c;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }

    return sorted;
  }

  return value;
}

export function parseState(json: string): RoadmapState {
  const raw: unknown = JSON.parse(json);

  return decodeState(compactStateSchema.parse(raw));
}

export function serializeState(state: RoadmapState): string {
  return JSON.stringify(sortKeysDeep(encodeState(state)), null, 2);
}
