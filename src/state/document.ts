import { nanoid } from "nanoid";
import {
  DEFAULT_CLUSTER_HEIGHT,
  DEFAULT_CLUSTER_WIDTH,
  ROADMAP_FRONTMATTER_KEY,
  ROADMAP_FRONTMATTER_VALUE,
  ROADMAP_SCHEMA_VERSION,
} from "../constants";
import type { RoadmapCluster, RoadmapEdge, RoadmapEndpoint, RoadmapNode, RoadmapState } from "../domain/types";
import { isReservedHeading, parseClusterHeading, renderClusterHeading } from "../markdown/cluster";
import { renderNodeBlock } from "../markdown/nodeBlock";
import { renderRelationsSection } from "../markdown/relations";
import { parseState, serializeState } from "./codec";

const FIRST_HEADING_RE = /^## /m;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const STATE_BLOCK_RE = /%%[ \t]*roadmap:state[ \t]*\r?\n```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\r?\n[ \t]*%%/;

const NODE_BOUNDARY_RE = /<!-- roadmap-node:id=\S+ type=\w+ -->|^## |%%[ \t]*roadmap:state/m;

const NODE_MARKER_RE = /<!-- roadmap-node:id=(\S+) type=\w+ -->/g;

const EDGE_MARKER_RE = /<!-- roadmap-edge:id=(\S+) -->/g;

const RELATIONS_HEADING_RE = /^## Relations[ \t]*$/m;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRoadmapFile(content: string): boolean {
  const frontmatter = FRONTMATTER_RE.exec(content);

  if (frontmatter === null) {
    return false;
  }

  const keyRe = new RegExp(`^${escapeRegExp(ROADMAP_FRONTMATTER_KEY)}:[ \\t]*(.+?)[ \\t]*$`, "m");
  const line = keyRe.exec(frontmatter[1]);

  if (line === null) {
    return false;
  }

  const value = line[1].replace(/^["']|["']$/g, "");

  return value === ROADMAP_FRONTMATTER_VALUE;
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
  const marker = new RegExp(`<!-- roadmap-node:id=${escapeRegExp(id)} type=\\w+ -->`);
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
  const marker = new RegExp(`<!-- roadmap-node:id=${escapeRegExp(node.id)} type=\\w+ -->`);
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
  const marker = new RegExp(`<!-- roadmap-node:id=${escapeRegExp(id)} type=\\w+ -->`);
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
  const marker = new RegExp(`<!-- roadmap-node:id=${escapeRegExp(id)} type=\\w+ -->`);
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

const NODE_MARKER_LINE_RE = /<!-- roadmap-node:id=(\S+) type=\w+ -->/;

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

export function reconcileState(state: RoadmapState, content: string): RoadmapState {
  const { clusters: bodyClusters, membership } = parseBody(content);
  const presentNodes = bodyNodeIds(content);
  const nodes: Record<string, RoadmapNode> = {};
  let changed = false;

  for (const [id, node] of Object.entries(state.nodes)) {
    if (!presentNodes.has(id)) {
      changed = true;
      continue;
    }

    let next = node;

    if (node.source.type === "text") {
      const bodyText = nodeBlockBody(content, id);
      const nextTitle = bodyText !== null && bodyText.length > 0 ? bodyText : undefined;

      if (nextTitle !== node.title) {
        next = { ...next, title: nextTitle };
        changed = true;
      }
    }

    const clusterId = membership.get(id) ?? null;

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

export function createRoadmapDocument(title: string): string {
  const frontmatter = [
    "---",
    `${ROADMAP_FRONTMATTER_KEY}: ${ROADMAP_FRONTMATTER_VALUE}`,
    `roadmap-version: ${ROADMAP_SCHEMA_VERSION}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${title}\n\n${buildStateBlock(emptyState())}\n`;
}
