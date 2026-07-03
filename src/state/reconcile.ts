import { nanoid } from "nanoid";
import {
  CLUSTER_PADDING,
  DEFAULT_CLUSTER_HEIGHT,
  DEFAULT_CLUSTER_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
} from "../constants";
import { arrangeClusterGrid, membersBoundingBox } from "../domain/clusterLayout";
import { fileKindForPath } from "../domain/paths";
import { sourceFile } from "../domain/source";
import { nodeTitle } from "../domain/title";
import {
  isNodeKind,
  type RoadmapCluster,
  type RoadmapEdge,
  type RoadmapEndpoint,
  type RoadmapNode,
  type RoadmapNodeSource,
  type RoadmapState,
} from "../domain/types";
import { isReservedHeading, parseClusterHeading } from "../markdown/cluster";
import { parseNodeBlock, renderNodeRepresentation, type ParsedNodeBlock } from "../markdown/nodeBlock";
import { parseRelationsLine, type ParsedRelationEndpoint } from "../markdown/relations";
import { encodeSource } from "./codec";
import {
  bodyBounds,
  bodyEdgeIds,
  bodyNodeIds,
  bodyNodeMarkers,
  bodyRegion,
  emptyState,
  NODE_MARKER_LINE_RE,
  nodeBlockBody,
  readState,
  relationsRegion,
  updateNodeBlock,
  writeRelations,
  writeState,
} from "./document";

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
 * Reserved headings (`## Relations`, `## Archive`) are section breaks, not clusters. Body is
 * canonical for membership; state caches it.
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

/** Compares sources through their canonical compact encoding from the codec. */
function sourcesEqual(a: RoadmapNodeSource, b: RoadmapNodeSource): boolean {
  return encodeSource(a).join("\0") === encodeSource(b).join("\0");
}

/**
 * Applies a hand-edited body block back onto the state node (body is
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
    const box = membersBoundingBox(members);
    const arrangement = box === null ? null : arrangeClusterGrid(members, box.width + CLUSTER_PADDING * 2);

    if (box === null || arrangement === null) {
      continue;
    }

    clusters[id] = {
      ...cluster,
      layout: {
        x: box.x - CLUSTER_PADDING,
        y: box.y - CLUSTER_PADDING,
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
    const present = presentNodes.has(id);

    if (trackNodes && !present) {
      changed = true;
      continue;
    }

    let next = node;

    if (present) {
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

    const clusterId = present ? (membership.get(id) ?? null) : (node.clusterId ?? null);

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
 * Edges recovered from `## Relations` lines. Marked lines keep their id (rebuild);
 * unmarked, hand-written lines get a fresh one (adoption). Lines whose endpoints do not
 * resolve, self-loops, and duplicates of already-collected pairs are skipped.
 */
function relationEdgesFromBody(
  state: RoadmapState,
  content: string,
  includeMarked: boolean,
): Record<string, RoadmapEdge> | null {
  let edges: Record<string, RoadmapEdge> | null = null;

  for (const line of relationsRegion(content).split(/\r?\n/)) {
    const parsed = parseRelationsLine(line);

    if (parsed === null || (!includeMarked && parsed.id !== undefined)) {
      continue;
    }

    if (parsed.id !== undefined && state.edges[parsed.id] !== undefined) {
      continue;
    }

    const from = resolveEndpoint(state, parsed.from);
    const to = resolveEndpoint(state, parsed.to);

    if (from === null || to === null || (from.type === to.type && from.id === to.id)) {
      continue;
    }

    const pairExists = Object.values(edges ?? state.edges).some(
      (edge) =>
        edge.from.type === from.type && edge.from.id === from.id && edge.to.type === to.type && edge.to.id === to.id,
    );

    if (pairExists) {
      continue;
    }

    edges ??= { ...state.edges };
    const edge: RoadmapEdge = { id: parsed.id ?? nanoid(), from, to, direction: parsed.direction };

    if (parsed.label !== undefined) edge.label = parsed.label;

    edges[edge.id] = edge;
  }

  return edges;
}

/** Node reconstructed from its body marker and readable block, or null when the marker
 * kind is unknown or the block does not parse. */
function nodeFromMarker(content: string, marker: { id: string; kind: string }, index: number): RoadmapNode | null {
  if (!isNodeKind(marker.kind)) {
    return null;
  }

  const body = nodeBlockBody(content, marker.id);
  const parsed = body === null ? null : parseNodeBlock(marker.kind, body);

  if (parsed === null) {
    return null;
  }

  const node: RoadmapNode = {
    id: marker.id,
    kind: marker.kind,
    source: parsed.source,
    layout: defaultNodeLayout(index),
  };

  if (parsed.title !== undefined) node.title = parsed.title;
  if (parsed.description !== undefined) node.description = parsed.description;
  if (parsed.status !== undefined) node.status = parsed.status;
  if (parsed.priority !== undefined) node.priority = parsed.priority;

  return node;
}

/**
 * Adopts body node markers unknown to the state as new nodes: a block pasted from
 * another roadmap or written by hand. Content is parsed from the block, membership from
 * the surrounding section; layout falls back to a grid slot, or a spot inside the
 * owning cluster.
 */
export function adoptNodeMarkers(state: RoadmapState, content: string): RoadmapState {
  let nodes: Record<string, RoadmapNode> | null = null;
  const { membership } = parseBody(content);

  bodyNodeMarkers(content).forEach((marker, index) => {
    if (state.nodes[marker.id] !== undefined) {
      return;
    }

    const node = nodeFromMarker(content, marker, index);

    if (node === null) {
      return;
    }

    const clusterId = membership.get(marker.id) ?? null;

    if (clusterId !== null && state.clusters[clusterId] !== undefined) {
      node.clusterId = clusterId;
      node.layout = { ...node.layout, x: CLUSTER_PADDING, y: CLUSTER_PADDING };
    }

    nodes ??= { ...state.nodes };
    nodes[marker.id] = node;
  });

  return nodes === null ? state : { ...state, nodes };
}

/**
 * Best-effort recovery when the hidden state block is missing: nodes are rebuilt from
 * body markers (source, title, description, tags parsed back from each block's readable
 * representation), clusters from marked headings, and edges from `## Relations` lines.
 * Layout cannot be recovered, so nodes fall back to a grid.
 */
export function rebuildState(content: string): RoadmapState {
  const state = emptyState();

  bodyNodeMarkers(content).forEach((marker, index) => {
    const node = nodeFromMarker(content, marker, index);

    if (node !== null) {
      state.nodes[marker.id] = node;
    }
  });

  const { clusters, membership } = parseBody(content);

  for (const [id, info] of clusters) {
    state.clusters[id] = defaultCluster(id, info);
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

  return { ...state, edges: relationEdgesFromBody(state, content, true) ?? state.edges };
}

const BARE_WIKILINK_LINE_RE = /^(?:-\s+(?:\[[ xX]\]\s+)?)?\[\[([^\][|#^]+)(?:\|([^\]]*))?\]\]\s*$/;

/**
 * Turns standalone wikilink lines hand-written in the body into marked node blocks, so
 * a `[[note]]` dropped into a section becomes a node on load. Only lines that consist
 * of a single link (optionally as a list item) qualify. The `## Relations` / `## Archive`
 * sections and the representation line right after an existing node marker are left
 * alone; the node kind follows the target's extension.
 */
export function adoptBareWikilinks(content: string): string {
  const bounds = bodyBounds(content);
  const lines = content.slice(bounds.start, bounds.end).split("\n");
  const result: string[] = [];
  let changed = false;
  let inReservedSection = false;
  let afterMarker = false;

  for (const line of lines) {
    const heading = parseClusterHeading(line);

    if (heading !== null) {
      inReservedSection = isReservedHeading(heading.title);
      afterMarker = false;
      result.push(line);
      continue;
    }

    if (NODE_MARKER_LINE_RE.test(line)) {
      afterMarker = true;
      result.push(line);
      continue;
    }

    if (line.trim().length === 0) {
      result.push(line);
      continue;
    }

    const skip = inReservedSection || afterMarker;

    afterMarker = false;
    const link = skip ? null : BARE_WIKILINK_LINE_RE.exec(line);

    if (link === null) {
      result.push(line);
      continue;
    }

    const target = link[1].trim();
    const alias = link[2]?.trim();
    const kind = fileKindForPath(target);

    changed = true;
    result.push(`<!-- roadmap-node:id=${nanoid()} type=${kind} -->`);

    if (kind === "image") {
      result.push(`![[${target}]]`);

      if (alias !== undefined && alias.length > 0) {
        result.push(`**${alias}**`);
      }
    } else {
      result.push(line);
    }
  }

  if (!changed) {
    return content;
  }

  return `${content.slice(0, bounds.start)}${result.join("\n")}${content.slice(bounds.end)}`;
}

/**
 * Adds cluster markers to hand-written `##` headings so they become real clusters
 * (every non-reserved `##` heading is a cluster). Reserved sections and
 * already-marked headings pass through untouched.
 */
export function ensureClusterMarkers(content: string): string {
  const bounds = bodyBounds(content);
  const body = content.slice(bounds.start, bounds.end);
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

  return `${content.slice(0, bounds.start)}${lines.join("\n")}${content.slice(bounds.end)}`;
}

/**
 * Creates edges for hand-written `## Relations` lines that carry no hidden edge marker
 * yet. The caller rewrites the section, which replaces adopted lines with their
 * canonical, marker-carrying form.
 */
export function adoptRelationEdges(state: RoadmapState, content: string): RoadmapState {
  const edges = relationEdgesFromBody(state, content, false);

  return edges === null ? state : { ...state, edges };
}

export type DocumentWarning = "rebuilt-state" | "restored-nodes";

export interface LoadedDocument {
  state: RoadmapState;
  content: string;
  warnings: DocumentWarning[];
}

/**
 * Full open pipeline: hand-written headings gain cluster markers, a missing state block
 * is rebuilt from the body, an existing one is reconciled against it (including adoption
 * of hand-written relation lines), and nodes whose body blocks are gone (a truncated or
 * half-synced file) get them restored instead of being dropped. Content differing from
 * `data` must be persisted by the caller. Throws on a corrupted or newer-version state
 * block (see `readState`), leaving the file untouched.
 */
export function loadDocument(data: string): LoadedDocument {
  const warnings: DocumentWarning[] = [];
  const parsed = readState(data);
  let marked = ensureClusterMarkers(data);
  const truncatedBody = parsed !== null && Object.keys(parsed.nodes).length > 0 && bodyNodeIds(data).size === 0;

  if (!truncatedBody) {
    marked = adoptBareWikilinks(marked);
  }

  let state: RoadmapState;

  if (parsed === null) {
    state = rebuildState(marked);

    if (Object.keys(state.nodes).length > 0 || Object.keys(state.clusters).length > 0) {
      warnings.push("rebuilt-state");
    }
  } else {
    state = reconcileState(parsed, marked);
    state = adoptNodeMarkers(state, marked);
    state = adoptRelationEdges(state, marked);
  }

  let content = state === parsed && marked === data ? data : writeRelations(writeState(marked, state), state);
  const present = bodyNodeIds(content);
  const orphans = Object.values(state.nodes).filter((node) => !present.has(node.id));

  if (orphans.length > 0) {
    for (const node of orphans) {
      content = updateNodeBlock(content, node);
    }

    content = writeRelations(writeState(content, state), state);
    warnings.push("restored-nodes");
  }

  return { state, content, warnings };
}

/**
 * Recovery entry for a file whose state block failed to parse: the broken block is
 * discarded and the roadmap is rebuilt from the readable body. Invoked explicitly by
 * the user from the load-error screen — layout is not recoverable, so this is never
 * done silently.
 */
export function rebuildDocument(data: string): LoadedDocument {
  const marked = adoptBareWikilinks(ensureClusterMarkers(data));
  const state = rebuildState(marked);
  const content = writeRelations(writeState(marked, state), state);

  return { state, content, warnings: ["rebuilt-state"] };
}
