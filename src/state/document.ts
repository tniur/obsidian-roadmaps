import { nanoid } from "nanoid";
import {
  CLUSTER_PADDING,
  DEFAULT_CLUSTER_HEIGHT,
  DEFAULT_CLUSTER_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  ROADMAP_FRONTMATTER_KEY,
  ROADMAP_FRONTMATTER_VALUE,
  ROADMAP_SCHEMA_VERSION,
} from "../constants";
import { arrangeClusterGrid } from "../domain/clusterLayout";
import { sourceFile } from "../domain/source";
import { nodeTitle } from "../domain/title";
import type {
  RoadmapCluster,
  RoadmapEdge,
  RoadmapEndpoint,
  RoadmapNode,
  RoadmapNodeKind,
  RoadmapNodeSource,
  RoadmapState,
} from "../domain/types";
import { isReservedHeading, parseClusterHeading, renderClusterHeading } from "../markdown/cluster";
import { parseNodeBlock, renderNodeBlock, renderNodeRepresentation, type ParsedNodeBlock } from "../markdown/nodeBlock";
import { parseRelationsLine, renderRelationsSection, type ParsedRelationEndpoint } from "../markdown/relations";
import { parseState, serializeState } from "./codec";

const FIRST_HEADING_RE = /^## /m;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const STATE_BLOCK_RE = /%%[ \t]*roadmap:state[ \t]*\r?\n```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\r?\n[ \t]*%%/;

const NODE_BOUNDARY_RE = /^<!-- roadmap-node:id=\S+ type=\w+ -->|^## |^%%[ \t]*roadmap:state/m;

const NODE_MARKER_RE = /^<!-- roadmap-node:id=(\S+) type=(\w+) -->/gm;

const EDGE_MARKER_RE = /<!-- roadmap-edge:id=(\S+) -->[ \t]*$/gm;

const RELATIONS_HEADING_RE = /^## Relations[ \t]*$/m;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeMarkerRe(id: string): RegExp {
  return new RegExp(`^<!-- roadmap-node:id=${escapeRegExp(id)} type=\\w+ -->`, "m");
}

export function emptyState(): RoadmapState {
  return {
    schemaVersion: ROADMAP_SCHEMA_VERSION,
    id: nanoid(),
    nodes: {},
    clusters: {},
    edges: {},
  };
}

export function extractStateBlock(content: string): string | null {
  const match = STATE_BLOCK_RE.exec(content);

  return match === null ? null : match[1];
}

export function readState(content: string): RoadmapState | null {
  const json = extractStateBlock(content);

  return json === null ? null : parseState(json);
}

function buildStateBlock(state: RoadmapState): string {
  return ["%% roadmap:state", "```json", serializeState(state), "```", "%%"].join("\n");
}

export function writeState(content: string, state: RoadmapState): string {
  const block = buildStateBlock(state);

  if (STATE_BLOCK_RE.test(content)) {
    return content.replace(STATE_BLOCK_RE, () => block);
  }

  return `${content.replace(/\s*$/, "")}\n\n${block}\n`;
}

function removeRelationsSection(body: string): string {
  const heading = RELATIONS_HEADING_RE.exec(body);

  if (heading === null) {
    return body;
  }

  const afterHeading = heading.index + heading[0].length;
  const next = /^## /m.exec(body.slice(afterHeading));
  const end = next === null ? body.length : afterHeading + next.index;

  return `${body.slice(0, heading.index)}${body.slice(end)}`;
}

export function writeRelations(content: string, state: RoadmapState): string {
  const frontmatter = FRONTMATTER_RE.exec(content);
  const bodyStart = frontmatter === null ? 0 : frontmatter[0].length;
  const stateBlock = STATE_BLOCK_RE.exec(content);
  const bodyEnd = stateBlock === null ? content.length : stateBlock.index;
  const before = content.slice(0, bodyStart);
  const body = removeRelationsSection(content.slice(bodyStart, bodyEnd)).replace(/\s+$/, "");
  const after = content.slice(bodyEnd).replace(/^\s+/, "");
  const section = renderRelationsSection(state);
  const newBody = section === null ? body : `${body}\n\n${section}`;

  if (after.length === 0) {
    return `${before}${newBody}\n`;
  }

  return `${before}${newBody}\n\n${after}`;
}

function insertIntoBody(body: string, block: string): string {
  const heading = FIRST_HEADING_RE.exec(body);

  if (heading !== null) {
    const head = body.slice(0, heading.index).replace(/\s+$/, "");
    const tail = body.slice(heading.index);

    return `${head}\n\n${block}\n\n${tail}`;
  }

  return `${body.replace(/\s+$/, "")}\n\n${block}\n\n`;
}

export function insertNodeBlock(content: string, node: RoadmapNode): string {
  const block = renderNodeBlock(node);
  const frontmatter = FRONTMATTER_RE.exec(content);
  const bodyStart = frontmatter === null ? 0 : frontmatter[0].length;
  const stateBlock = STATE_BLOCK_RE.exec(content);
  const bodyEnd = stateBlock === null ? content.length : stateBlock.index;
  const before = content.slice(0, bodyStart);
  const body = content.slice(bodyStart, bodyEnd);
  const after = content.slice(bodyEnd);

  return `${before}${insertIntoBody(body, block)}${after}`;
}

export function removeNodeBlock(content: string, id: string): string {
  const marker = nodeMarkerRe(id);
  const match = marker.exec(content);

  if (match === null) {
    return content;
  }

  const afterMarker = match.index + match[0].length;
  const boundary = NODE_BOUNDARY_RE.exec(content.slice(afterMarker));
  const end = boundary === null ? content.length : afterMarker + boundary.index;
  const before = content.slice(0, match.index).replace(/\s*$/, "");
  const after = content.slice(end).replace(/^\s*/, "");

  return after.length === 0 ? `${before}\n` : `${before}\n\n${after}`;
}

export function updateNodeBlock(content: string, node: RoadmapNode): string {
  const marker = nodeMarkerRe(node.id);
  const match = marker.exec(content);

  if (match === null) {
    return insertNodeBlock(content, node);
  }

  const afterMarker = match.index + match[0].length;
  const boundary = NODE_BOUNDARY_RE.exec(content.slice(afterMarker));
  const end = boundary === null ? content.length : afterMarker + boundary.index;
  const block = renderNodeBlock(node);
  const before = content.slice(0, match.index).replace(/\s*$/, "");
  const after = content.slice(end).replace(/^\s*/, "");

  return after.length === 0 ? `${before}\n\n${block}\n` : `${before}\n\n${block}\n\n${after}`;
}

/**
 * Readable text between a node marker and the next block boundary, trimmed. For inline
 * text nodes this is the canonical content, so hand-edits in the Markdown body are
 * honored on load (see `reconcileState`).
 */
export function nodeBlockBody(content: string, id: string): string | null {
  const marker = nodeMarkerRe(id);
  const match = marker.exec(content);

  if (match === null) {
    return null;
  }

  const afterMarker = match.index + match[0].length;
  const boundary = NODE_BOUNDARY_RE.exec(content.slice(afterMarker));
  const end = boundary === null ? content.length : afterMarker + boundary.index;

  return content.slice(afterMarker, end).trim();
}

function locateNodeBlock(content: string, id: string): { start: number; end: number } | null {
  const marker = nodeMarkerRe(id);
  const match = marker.exec(content);

  if (match === null) {
    return null;
  }

  const afterMarker = match.index + match[0].length;
  const boundary = NODE_BOUNDARY_RE.exec(content.slice(afterMarker));
  const end = boundary === null ? content.length : afterMarker + boundary.index;

  return { start: match.index, end };
}

/**
 * Moves the given node blocks under a new cluster `##` heading, placed before `## Relations` /
 * the state block. Node membership is canonical in body order, so grouping rewrites positions.
 */
export function writeClusterSection(
  content: string,
  cluster: RoadmapCluster,
  memberNodeIds: readonly string[],
): string {
  const blocks: string[] = [];
  let working = content;

  for (const id of memberNodeIds) {
    const loc = locateNodeBlock(working, id);

    if (loc === null) {
      continue;
    }

    blocks.push(working.slice(loc.start, loc.end).trim());
    const before = working.slice(0, loc.start).replace(/\s*$/, "");
    const after = working.slice(loc.end).replace(/^\s*/, "");

    working = after.length === 0 ? `${before}\n` : `${before}\n\n${after}`;
  }

  const section = [renderClusterHeading(cluster), ...blocks].join("\n\n");
  const relations = RELATIONS_HEADING_RE.exec(working);
  const stateBlock = STATE_BLOCK_RE.exec(working);
  const insertAt = relations !== null ? relations.index : stateBlock !== null ? stateBlock.index : working.length;
  const before = working.slice(0, insertAt).replace(/\s*$/, "");
  const after = working.slice(insertAt).replace(/^\s*/, "");

  return after.length === 0 ? `${before}\n\n${section}\n` : `${before}\n\n${section}\n\n${after}`;
}

export function replaceClusterHeading(content: string, cluster: RoadmapCluster): string {
  const re = new RegExp(`^##[^\\n]*<!-- roadmap-cluster:id=${escapeRegExp(cluster.id)} -->[^\\n]*$`, "m");

  return content.replace(re, () => renderClusterHeading(cluster));
}

export function removeClusterHeading(content: string, clusterId: string): string {
  const re = new RegExp(`^##[^\\n]*<!-- roadmap-cluster:id=${escapeRegExp(clusterId)} -->[^\\n]*\\r?\\n?`, "m");

  return content.replace(re, "");
}

function insertBlocksUnclustered(content: string, blocks: readonly string[]): string {
  if (blocks.length === 0) {
    return content;
  }

  const section = blocks.join("\n\n");
  const frontmatter = FRONTMATTER_RE.exec(content);
  const bodyStart = frontmatter === null ? 0 : frontmatter[0].length;
  const body = content.slice(bodyStart);
  const heading = FIRST_HEADING_RE.exec(body);
  const stateBlock = STATE_BLOCK_RE.exec(body);
  const offset = heading !== null ? heading.index : stateBlock !== null ? stateBlock.index : body.length;
  const insertAt = bodyStart + offset;
  const before = content.slice(0, insertAt).replace(/\s*$/, "");
  const after = content.slice(insertAt).replace(/^\s*/, "");

  return after.length === 0 ? `${before}\n\n${section}\n` : `${before}\n\n${section}\n\n${after}`;
}

/**
 * Removes a cluster heading and moves its member node blocks into the unclustered region
 * (before the first remaining heading), so the nodes survive as top-level after ungrouping.
 */
export function dissolveClusterSection(content: string, clusterId: string, memberNodeIds: readonly string[]): string {
  const blocks: string[] = [];
  let working = content;

  for (const id of memberNodeIds) {
    const loc = locateNodeBlock(working, id);

    if (loc === null) {
      continue;
    }

    blocks.push(working.slice(loc.start, loc.end).trim());
    const before = working.slice(0, loc.start).replace(/\s*$/, "");
    const after = working.slice(loc.end).replace(/^\s*/, "");

    working = after.length === 0 ? `${before}\n` : `${before}\n\n${after}`;
  }

  working = removeClusterHeading(working, clusterId);

  return insertBlocksUnclustered(working, blocks).replace(/\n{3,}/g, "\n\n");
}

/**
 * Moves a single node's block under a cluster heading (joining) or into the unclustered region
 * (leaving), so spatial drag in/out of a cluster keeps body membership canonical.
 */
export function moveNodeToCluster(content: string, nodeId: string, clusterId: string | null): string {
  const loc = locateNodeBlock(content, nodeId);

  if (loc === null) {
    return content;
  }

  const block = content.slice(loc.start, loc.end).trim();
  const head = content.slice(0, loc.start).replace(/\s*$/, "");
  const rest = content.slice(loc.end).replace(/^\s*/, "");
  const without = rest.length === 0 ? `${head}\n` : `${head}\n\n${rest}`;

  if (clusterId === null) {
    return insertBlocksUnclustered(without, [block]);
  }

  const re = new RegExp(`^##[^\\n]*<!-- roadmap-cluster:id=${escapeRegExp(clusterId)} -->[^\\n]*$`, "m");
  const heading = re.exec(without);

  if (heading === null) {
    return insertBlocksUnclustered(without, [block]);
  }

  const at = heading.index + heading[0].length;
  const before = without.slice(0, at).replace(/\s*$/, "");
  const after = without.slice(at).replace(/^\s*/, "");

  return `${before}\n\n${block}\n\n${after}`;
}

export function bodyNodeIds(content: string): Set<string> {
  const ids = new Set<string>();

  for (const match of content.matchAll(NODE_MARKER_RE)) {
    ids.add(match[1]);
  }

  return ids;
}

export function bodyEdgeIds(content: string): Set<string> {
  const ids = new Set<string>();

  for (const match of content.matchAll(EDGE_MARKER_RE)) {
    ids.add(match[1]);
  }

  return ids;
}

const NODE_MARKER_LINE_RE = /^<!-- roadmap-node:id=(\S+) type=(\w+) -->/;

function bodyRegion(content: string): string {
  const frontmatter = FRONTMATTER_RE.exec(content);
  const bodyStart = frontmatter === null ? 0 : frontmatter[0].length;
  const stateBlock = STATE_BLOCK_RE.exec(content);
  const bodyEnd = stateBlock === null ? content.length : stateBlock.index;

  return content.slice(bodyStart, bodyEnd);
}

interface ClusterInfo {
  title: string;
}

interface ParsedBody {
  clusters: Map<string, ClusterInfo>;
  membership: Map<string, string | null>;
}

/**
 * Walks the readable body once, deriving cluster declarations (from `##` headings carrying a
 * cluster marker) and node membership (each node belongs to the cluster section it sits in).
 * Reserved headings (`## Relations`, `## Archive`) and markerless headings are section breaks,
 * not clusters. Body is canonical for membership ([[ADR-0002]]); state caches it.
 */
function parseBody(content: string): ParsedBody {
  const clusters = new Map<string, ClusterInfo>();
  const membership = new Map<string, string | null>();
  let current: string | null = null;

  for (const line of bodyRegion(content).split(/\r?\n/)) {
    const heading = parseClusterHeading(line);

    if (heading !== null) {
      if (heading.id !== null && !isReservedHeading(heading.title)) {
        current = heading.id;
        clusters.set(heading.id, { title: heading.title });
      } else {
        current = null;
      }

      continue;
    }

    const node = NODE_MARKER_LINE_RE.exec(line);

    if (node !== null) {
      membership.set(node[1], current);
    }
  }

  return { clusters, membership };
}

function defaultCluster(id: string, info: ClusterInfo): RoadmapCluster {
  return {
    id,
    title: info.title,
    layout: { x: 0, y: 0, width: DEFAULT_CLUSTER_WIDTH, height: DEFAULT_CLUSTER_HEIGHT },
  };
}

function sourcesEqual(a: RoadmapNodeSource, b: RoadmapNodeSource): boolean {
  if (a.type !== b.type) {
    return false;
  }

  const other = b as typeof a;

  switch (a.type) {
    case "note":
    case "image":
    case "attachment":
      return a.file === (other as { file: string }).file;

    case "heading": {
      const h = other as { file: string; heading: string };

      return a.file === h.file && a.heading === h.heading;
    }

    case "block": {
      const bl = other as { file: string; blockId: string };

      return a.file === bl.file && a.blockId === bl.blockId;
    }

    case "url":
      return a.url === (other as { url: string }).url;
    case "text":
      return true;
  }
}

/**
 * Applies a hand-edited body block back onto the state node ([[ADR-0002]]: body is
 * canonical for readable content). Layout, alignment and color stay state-only. Inline
 * text nodes keep their original source (the block carries only the text) and their
 * state-only meta.
 */
function mergeParsedBlock(node: RoadmapNode, parsed: ParsedNodeBlock): RoadmapNode {
  const next: RoadmapNode = { ...node };

  if (parsed.title !== undefined) next.title = parsed.title;
  else delete next.title;

  if (node.source.type === "text") {
    return next;
  }

  next.source = parsed.source;

  if (parsed.description !== undefined) next.description = parsed.description;
  else delete next.description;

  if (parsed.status !== undefined) next.status = parsed.status;
  else delete next.status;

  if (parsed.priority !== undefined) next.priority = parsed.priority;
  else delete next.priority;

  return next;
}

function sameNodeContent(a: RoadmapNode, b: RoadmapNode): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.priority === b.priority &&
    sourcesEqual(a.source, b.source)
  );
}

/**
 * Lays out clusters that first appeared in the body (hand-written headings): the cluster
 * anchors at its members' bounding box and the members snap into the same tidy grid the
 * "Arrange nodes" action produces, with the cluster sized exactly to fit. Clusters
 * already known to state keep their layout.
 */
function fitNewClusters(
  state: RoadmapState,
  nodes: Record<string, RoadmapNode>,
  clusters: Record<string, RoadmapCluster>,
): void {
  for (const [id, cluster] of Object.entries(clusters)) {
    if (state.clusters[id] !== undefined) {
      continue;
    }

    const members = Object.values(nodes).filter((node) => node.clusterId === id);

    if (members.length === 0) {
      continue;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;

    for (const member of members) {
      minX = Math.min(minX, member.layout.x);
      minY = Math.min(minY, member.layout.y);
      maxX = Math.max(maxX, member.layout.x + member.layout.width);
    }

    const arrangement = arrangeClusterGrid(members, maxX - minX + CLUSTER_PADDING * 2);

    if (arrangement === null) {
      continue;
    }

    clusters[id] = {
      ...cluster,
      layout: {
        x: minX - CLUSTER_PADDING,
        y: minY - CLUSTER_PADDING,
        width: arrangement.width,
        height: arrangement.height,
      },
    };

    for (const [memberId, position] of arrangement.positions) {
      const member = nodes[memberId];

      nodes[memberId] = { ...member, layout: { ...member.layout, x: position.x, y: position.y } };
    }
  }
}

export function reconcileState(state: RoadmapState, content: string): RoadmapState {
  const { clusters: bodyClusters, membership } = parseBody(content);
  const presentNodes = bodyNodeIds(content);
  const trackNodes = presentNodes.size > 0;
  const nodes: Record<string, RoadmapNode> = {};
  let changed = false;

  for (const [id, node] of Object.entries(state.nodes)) {
    if (trackNodes && !presentNodes.has(id)) {
      changed = true;
      continue;
    }

    let next = node;

    if (presentNodes.has(id)) {
      const body = nodeBlockBody(content, id);

      if (body !== null && body !== renderNodeRepresentation(node).trim()) {
        const parsed = parseNodeBlock(node.kind, body);

        if (parsed !== null) {
          const merged = mergeParsedBlock(node, parsed);

          if (!sameNodeContent(merged, node)) {
            next = merged;
            changed = true;
          }
        }
      }
    }

    const clusterId = presentNodes.has(id) ? (membership.get(id) ?? null) : (node.clusterId ?? null);

    if ((next.clusterId ?? null) !== clusterId) {
      next = { ...next, clusterId };
      changed = true;
    }

    nodes[id] = next;
  }

  const clusters: Record<string, RoadmapCluster> = {};

  for (const [id, info] of bodyClusters) {
    const existing = state.clusters[id];

    if (existing !== undefined && existing.title === info.title) {
      clusters[id] = existing;
    } else {
      clusters[id] = existing === undefined ? defaultCluster(id, info) : { ...existing, ...info };
      changed = true;
    }
  }

  if (Object.keys(state.clusters).some((id) => !bodyClusters.has(id))) {
    changed = true;
  }

  for (const [id, node] of Object.entries(nodes)) {
    if (node.clusterId != null && clusters[node.clusterId] === undefined) {
      nodes[id] = { ...node, clusterId: null };
      changed = true;
    }
  }

  fitNewClusters(state, nodes, clusters);

  const presentEdges = bodyEdgeIds(content);
  const trackEdges = presentEdges.size > 0;
  const hasEndpoint = (endpoint: RoadmapEndpoint): boolean =>
    endpoint.type === "node" ? nodes[endpoint.id] !== undefined : clusters[endpoint.id] !== undefined;
  const edges: Record<string, RoadmapEdge> = {};

  for (const [id, edge] of Object.entries(state.edges)) {
    const marked = !trackEdges || presentEdges.has(id);

    if (marked && hasEndpoint(edge.from) && hasEndpoint(edge.to)) {
      edges[id] = edge;
    } else {
      changed = true;
    }
  }

  return changed ? { ...state, nodes, clusters, edges } : state;
}

const REBUILD_GRID_COLUMNS = 4;

const REBUILD_GRID_GAP = 48;

function defaultNodeLayout(index: number): RoadmapNode["layout"] {
  return {
    x: (index % REBUILD_GRID_COLUMNS) * (DEFAULT_NODE_WIDTH + REBUILD_GRID_GAP),
    y: Math.floor(index / REBUILD_GRID_COLUMNS) * (DEFAULT_NODE_HEIGHT + REBUILD_GRID_GAP),
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  };
}

function resolveEndpoint(state: RoadmapState, endpoint: ParsedRelationEndpoint): RoadmapEndpoint | null {
  if (endpoint.clusterTitle !== undefined) {
    const cluster = Object.values(state.clusters).find((entry) => entry.title === endpoint.clusterTitle);

    return cluster === undefined ? null : { type: "cluster", id: cluster.id };
  }

  const nodes = Object.values(state.nodes);
  let node: RoadmapNode | undefined;

  if (endpoint.linkTarget !== undefined) {
    const target = endpoint.linkTarget;

    node =
      nodes.find((entry) => {
        const file = sourceFile(entry.source);

        return file === target || file === `${target}.md`;
      }) ?? nodes.find((entry) => nodeTitle(entry) === endpoint.linkAlias);
  } else if (endpoint.url !== undefined) {
    node = nodes.find((entry) => entry.source.type === "url" && entry.source.url === endpoint.url);
  } else if (endpoint.text !== undefined) {
    const text = endpoint.text;
    const byTitle = (value: string): RoadmapNode | undefined =>
      nodes.find((entry) => entry.source.type === "text" && nodeTitle(entry) === value);
    const labelSplit = text.lastIndexOf(": ");

    node = byTitle(text) ?? (labelSplit === -1 ? undefined : byTitle(text.slice(0, labelSplit)));
  }

  return node === undefined ? null : { type: "node", id: node.id };
}

/**
 * Best-effort recovery when the hidden state block is missing: nodes are rebuilt from
 * body markers (source, title, description, tags parsed back from each block's readable
 * representation), clusters from marked headings, and edges from `## Relations` lines.
 * Layout cannot be recovered, so nodes fall back to a grid ([[ADR-0011]]).
 */
export function rebuildState(content: string): RoadmapState {
  const state = emptyState();
  const region = bodyRegion(content);
  const markers = [...region.matchAll(NODE_MARKER_RE)];

  markers.forEach((marker, index) => {
    const id = marker[1];
    const kind = marker[2] as RoadmapNodeKind;
    const body = nodeBlockBody(content, id);
    const parsed = body === null ? null : parseNodeBlock(kind, body);

    if (parsed === null) {
      return;
    }

    const node: RoadmapNode = { id, kind, source: parsed.source, layout: defaultNodeLayout(index) };

    if (parsed.title !== undefined) node.title = parsed.title;
    if (parsed.description !== undefined) node.description = parsed.description;
    if (parsed.status !== undefined) node.status = parsed.status;
    if (parsed.priority !== undefined) node.priority = parsed.priority;

    state.nodes[id] = node;
  });

  const { clusters, membership } = parseBody(content);

  for (const [id, info] of clusters) {
    state.clusters[id] = {
      id,
      title: info.title,
      layout: { x: 0, y: 0, width: DEFAULT_CLUSTER_WIDTH, height: DEFAULT_CLUSTER_HEIGHT },
    };
  }

  for (const [nodeId, clusterId] of membership) {
    const node = state.nodes[nodeId];

    if (node !== undefined && clusterId !== null && state.clusters[clusterId] !== undefined) {
      node.clusterId = clusterId;
    }
  }

  let clusterCursor = 0;

  for (const cluster of Object.values(state.clusters)) {
    const members = Object.values(state.nodes).filter((node) => node.clusterId === cluster.id);
    const arrangement = arrangeClusterGrid(members, DEFAULT_CLUSTER_WIDTH);
    const width = arrangement?.width ?? DEFAULT_CLUSTER_WIDTH;
    const height = arrangement?.height ?? DEFAULT_CLUSTER_HEIGHT;

    cluster.layout = { x: clusterCursor, y: -height - REBUILD_GRID_GAP, width, height };
    clusterCursor += width + REBUILD_GRID_GAP;

    for (const [memberId, position] of arrangement?.positions ?? []) {
      const member = state.nodes[memberId];

      member.layout = { ...member.layout, x: position.x, y: position.y };
    }
  }

  for (const line of relationsRegion(content).split(/\r?\n/)) {
    const parsed = parseRelationsLine(line);

    if (parsed === null || (parsed.id !== undefined && state.edges[parsed.id] !== undefined)) {
      continue;
    }

    const from = resolveEndpoint(state, parsed.from);
    const to = resolveEndpoint(state, parsed.to);

    if (from === null || to === null || (from.type === to.type && from.id === to.id)) {
      continue;
    }

    const id = parsed.id ?? nanoid();
    const edge: RoadmapEdge = { id, from, to, direction: parsed.direction };

    if (parsed.label !== undefined) edge.label = parsed.label;

    state.edges[id] = edge;
  }

  return state;
}

function relationsRegion(content: string): string {
  const body = bodyRegion(content);
  const heading = RELATIONS_HEADING_RE.exec(body);

  if (heading === null) {
    return "";
  }

  const after = heading.index + heading[0].length;
  const next = /^## /m.exec(body.slice(after));

  return next === null ? body.slice(after) : body.slice(after, after + next.index);
}

/**
 * Adds `##` cluster markers to hand-written headings so they become real clusters
 * ([[ADR-0005]]: every non-reserved `##` heading is a cluster). Reserved sections and
 * already-marked headings pass through untouched.
 */
export function ensureClusterMarkers(content: string): string {
  const frontmatter = FRONTMATTER_RE.exec(content);
  const bodyStart = frontmatter === null ? 0 : frontmatter[0].length;
  const stateBlock = STATE_BLOCK_RE.exec(content);
  const bodyEnd = stateBlock === null ? content.length : stateBlock.index;
  const body = content.slice(bodyStart, bodyEnd);
  let changed = false;
  const lines = body.split("\n").map((line) => {
    const heading = parseClusterHeading(line);

    if (heading === null || heading.id !== null || heading.title.length === 0 || isReservedHeading(heading.title)) {
      return line;
    }

    changed = true;

    return `${line.trimEnd()} <!-- roadmap-cluster:id=${nanoid()} -->`;
  });

  if (!changed) {
    return content;
  }

  return `${content.slice(0, bodyStart)}${lines.join("\n")}${content.slice(bodyEnd)}`;
}

/**
 * Creates edges for hand-written `## Relations` lines that carry no hidden edge marker
 * yet. Endpoints resolve against the reconciled state; unresolvable or duplicate lines
 * are left alone. The caller rewrites the section, which replaces adopted lines with
 * their canonical, marker-carrying form.
 */
export function adoptRelationEdges(state: RoadmapState, content: string): RoadmapState {
  let edges: Record<string, RoadmapEdge> | null = null;

  for (const line of relationsRegion(content).split(/\r?\n/)) {
    const parsed = parseRelationsLine(line);

    if (parsed === null || parsed.id !== undefined) {
      continue;
    }

    const from = resolveEndpoint(state, parsed.from);
    const to = resolveEndpoint(state, parsed.to);

    if (from === null || to === null || (from.type === to.type && from.id === to.id)) {
      continue;
    }

    const existing = Object.values(edges ?? state.edges).some(
      (edge) =>
        edge.from.type === from.type && edge.from.id === from.id && edge.to.type === to.type && edge.to.id === to.id,
    );

    if (existing) {
      continue;
    }

    edges ??= { ...state.edges };
    const edge: RoadmapEdge = { id: nanoid(), from, to, direction: parsed.direction };

    if (parsed.label !== undefined) edge.label = parsed.label;

    edges[edge.id] = edge;
  }

  return edges === null ? state : { ...state, edges };
}

export function createRoadmapDocument(title: string): string {
  const frontmatter = [
    "---",
    `${ROADMAP_FRONTMATTER_KEY}: ${ROADMAP_FRONTMATTER_VALUE}`,
    `roadmap-version: ${ROADMAP_SCHEMA_VERSION}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${title}\n\n${buildStateBlock(emptyState())}\n`;
}
