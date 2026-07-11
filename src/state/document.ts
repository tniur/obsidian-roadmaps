import { nanoid } from "nanoid";
import { ROADMAP_FRONTMATTER_KEY, ROADMAP_FRONTMATTER_VALUE, ROADMAP_SCHEMA_VERSION } from "../constants";
import type { RoadmapCluster, RoadmapNode, RoadmapState } from "../domain/types";
import { renderClusterHeading } from "../markdown/cluster";
import { MARKER_ATTRS_PATTERN, MARKER_ATTRS_SKIP, parseMarkerAttrs, type MarkerAttrs } from "../markdown/markerAttrs";
import { renderNodeBlock } from "../markdown/nodeBlock";
import { renderRelationsSection } from "../markdown/relations";
import { parseState, serializeState } from "./codec";

const FIRST_HEADING_RE = /^## /m;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const STATE_BLOCK_RE = /%%[ \t]*roadmap:state[ \t]*\r?\n```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\r?\n[ \t]*%%/;

/** Just the opening marker — matches even when the block's fence/closer is corrupt. */
const STATE_BLOCK_OPEN_RE = /%%[ \t]*roadmap:state\b/g;

const NODE_BOUNDARY_RE = new RegExp(
  `^<!-- roadmap-node:id=\\S+ type=\\w+${MARKER_ATTRS_SKIP} -->|^## |^%%[ \\t]*roadmap:state`,
  "m",
);

export const NODE_MARKER_LINE_RE = new RegExp(`^<!-- roadmap-node:id=(\\S+) type=(\\w+)${MARKER_ATTRS_PATTERN} -->`);

const NODE_MARKER_RE = new RegExp(NODE_MARKER_LINE_RE.source, "gm");

const EDGE_MARKER_RE = new RegExp(`<!-- roadmap-edge:id=(\\S+)${MARKER_ATTRS_SKIP} -->[ \\t]*$`, "gm");

const RELATIONS_HEADING_RE = /^## Relations[ \t]*$/m;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeMarkerRe(id: string): RegExp {
  return new RegExp(`^<!-- roadmap-node:id=${escapeRegExp(id)} type=\\w+${MARKER_ATTRS_SKIP} -->`, "m");
}

function clusterHeadingRe(id: string, consumeNewline = false): RegExp {
  const tail = consumeNewline ? "[^\\n]*\\r?\\n?" : "[^\\n]*$";

  return new RegExp(`^##[^\\n]*<!-- roadmap-cluster:id=${escapeRegExp(id)}${MARKER_ATTRS_SKIP} -->${tail}`, "m");
}

interface Region {
  start: number;
  end: number;
}

/** Bounds of the readable body: after the frontmatter, before the hidden state block. */
export function bodyBounds(content: string): Region {
  const frontmatter = FRONTMATTER_RE.exec(content);
  const start = frontmatter === null ? 0 : frontmatter[0].length;
  const stateBlock = STATE_BLOCK_RE.exec(content);
  const end = stateBlock === null ? content.length : stateBlock.index;

  return { start, end };
}

export function bodyRegion(content: string): string {
  const { start, end } = bodyBounds(content);

  return content.slice(start, end);
}

/** Lines of the `## Relations` section, or an empty string when the section is absent. */
export function relationsRegion(content: string): string {
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
 * Splices `block` (or nothing) over `[start, end)`, normalizing the seams to a single
 * blank line. Every structural edit of the body funnels through this to keep spacing
 * uniform.
 */
function replaceRange(content: string, region: Region, block: string | null): string {
  const before = content.slice(0, region.start).replace(/\s*$/, "");
  const after = content.slice(region.end).replace(/^\s*/, "");
  const middle = block === null ? "" : `\n\n${block}`;

  return after.length === 0 ? `${before}${middle}\n` : `${before}${middle}\n\n${after}`;
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

function extractStateBlock(content: string): string | null {
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

/**
 * Replaces the hidden state block, or appends one at EOF when no well-formed block
 * exists. A lingering bare `%% roadmap:state` opener (corrupt or partially written
 * block) and everything after it is dropped first, so the rewrite never leaves two
 * state markers; only the last opener counts, leaving an earlier hand-written mention
 * in the body alone.
 */
export function writeState(content: string, state: RoadmapState): string {
  const block = buildStateBlock(state);

  if (STATE_BLOCK_RE.test(content)) {
    return content.replace(STATE_BLOCK_RE, () => block);
  }

  const openers = [...content.matchAll(STATE_BLOCK_OPEN_RE)];
  const lastOpener = openers.at(-1);
  const base = lastOpener === undefined ? content : content.slice(0, lastOpener.index);

  return `${base.replace(/\s*$/, "")}\n\n${block}\n`;
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
  const bounds = bodyBounds(content);
  const before = content.slice(0, bounds.start);
  const body = removeRelationsSection(content.slice(bounds.start, bounds.end)).replace(/\s+$/, "");
  const after = content.slice(bounds.end).replace(/^\s+/, "");
  const section = renderRelationsSection(state);
  const newBody = section === null ? body : `${body}\n\n${section}`;

  if (after.length === 0) {
    return `${before}${newBody}\n`;
  }

  return `${before}${newBody}\n\n${after}`;
}

/** New blocks land in the unclustered region: before the first `##` heading, else at the
 * end of the body. */
function unclusteredInsertPoint(content: string): number {
  const bounds = bodyBounds(content);
  const body = content.slice(bounds.start, bounds.end);
  const heading = FIRST_HEADING_RE.exec(body);

  return bounds.start + (heading !== null ? heading.index : body.length);
}

export function insertNodeBlock(content: string, node: RoadmapNode): string {
  const at = unclusteredInsertPoint(content);

  return replaceRange(content, { start: at, end: at }, renderNodeBlock(node));
}

interface NodeBlockLocation extends Region {
  contentStart: number;
}

/** Bounds of a node's block: its marker line up to the next block boundary (another
 * marker, a `##` heading, or the state block). */
function locateNodeBlock(content: string, id: string): NodeBlockLocation | null {
  const match = nodeMarkerRe(id).exec(content);

  if (match === null) {
    return null;
  }

  const contentStart = match.index + match[0].length;
  const boundary = NODE_BOUNDARY_RE.exec(content.slice(contentStart));
  const end = boundary === null ? content.length : contentStart + boundary.index;

  return { start: match.index, contentStart, end };
}

export function removeNodeBlock(content: string, id: string): string {
  const location = locateNodeBlock(content, id);

  return location === null ? content : replaceRange(content, location, null);
}

export function updateNodeBlock(content: string, node: RoadmapNode): string {
  const location = locateNodeBlock(content, node.id);

  if (location === null) {
    return insertNodeBlock(content, node);
  }

  return replaceRange(content, location, renderNodeBlock(node));
}

/**
 * Readable text between a node marker and the next block boundary, trimmed. For inline
 * text nodes this is the canonical content, so hand-edits in the Markdown body are
 * honored on load (see `reconcileState`).
 */
export function nodeBlockBody(content: string, id: string): string | null {
  const location = locateNodeBlock(content, id);

  return location === null ? null : content.slice(location.contentStart, location.end).trim();
}

/** Full node block including its marker line, for comparison against the canonical form. */
export function nodeBlockText(content: string, id: string): string | null {
  const location = locateNodeBlock(content, id);

  return location === null ? null : content.slice(location.start, location.end).trim();
}

/** Cuts the blocks of the given nodes out of the content, in the given order. */
function extractNodeBlocks(content: string, ids: readonly string[]): { content: string; blocks: string[] } {
  const blocks: string[] = [];
  let working = content;

  for (const id of ids) {
    const location = locateNodeBlock(working, id);

    if (location === null) {
      continue;
    }

    blocks.push(working.slice(location.start, location.end).trim());
    working = replaceRange(working, location, null);
  }

  return { content: working, blocks };
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
  const extracted = extractNodeBlocks(content, memberNodeIds);
  const section = [renderClusterHeading(cluster), ...extracted.blocks].join("\n\n");
  const relations = RELATIONS_HEADING_RE.exec(extracted.content);
  const stateBlock = STATE_BLOCK_RE.exec(extracted.content);
  const at = relations !== null ? relations.index : stateBlock !== null ? stateBlock.index : extracted.content.length;

  return replaceRange(extracted.content, { start: at, end: at }, section);
}

export function replaceClusterHeading(content: string, cluster: RoadmapCluster): string {
  return content.replace(clusterHeadingRe(cluster.id), () => renderClusterHeading(cluster));
}

export function removeClusterHeading(content: string, clusterId: string): string {
  return content.replace(clusterHeadingRe(clusterId, true), "");
}

function insertBlocksUnclustered(content: string, blocks: readonly string[]): string {
  if (blocks.length === 0) {
    return content;
  }

  const at = unclusteredInsertPoint(content);

  return replaceRange(content, { start: at, end: at }, blocks.join("\n\n"));
}

/**
 * Removes a cluster heading and moves its member node blocks into the unclustered region
 * (before the first remaining heading), so the nodes survive as top-level after ungrouping.
 */
export function dissolveClusterSection(content: string, clusterId: string, memberNodeIds: readonly string[]): string {
  const extracted = extractNodeBlocks(content, memberNodeIds);
  const without = removeClusterHeading(extracted.content, clusterId);

  return insertBlocksUnclustered(without, extracted.blocks).replace(/\n{3,}/g, "\n\n");
}

/**
 * Moves a single node's block under a cluster heading (joining) or into the unclustered region
 * (leaving), so spatial drag in/out of a cluster keeps body membership canonical.
 */
export function moveNodeToCluster(content: string, nodeId: string, clusterId: string | null): string {
  const extracted = extractNodeBlocks(content, [nodeId]);

  if (extracted.blocks.length === 0) {
    return content;
  }

  if (clusterId !== null) {
    const heading = clusterHeadingRe(clusterId).exec(extracted.content);

    if (heading !== null) {
      const at = heading.index + heading[0].length;

      return replaceRange(extracted.content, { start: at, end: at }, extracted.blocks[0]);
    }
  }

  return insertBlocksUnclustered(extracted.content, extracted.blocks);
}

export interface BodyNodeMarker {
  id: string;
  kind: string;
  attrs: MarkerAttrs;
}

/** Node markers of the readable body, in document order. */
export function bodyNodeMarkers(content: string): BodyNodeMarker[] {
  return [...bodyRegion(content).matchAll(NODE_MARKER_RE)].map((match) => ({
    id: match[1],
    kind: match[2],
    attrs: parseMarkerAttrs(match[3]),
  }));
}

export function bodyNodeIds(content: string): Set<string> {
  return new Set(bodyNodeMarkers(content).map((marker) => marker.id));
}

export function bodyEdgeIds(content: string): Set<string> {
  const ids = new Set<string>();

  for (const match of bodyRegion(content).matchAll(EDGE_MARKER_RE)) {
    ids.add(match[1]);
  }

  return ids;
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

/**
 * Renders a full roadmap document from a state built elsewhere (e.g. an import): node blocks,
 * cluster sections with their members, the `## Relations` section and the hidden state block.
 * Mirrors how the session grows a document, so the result reconciles cleanly on open.
 */
export function renderStateDocument(state: RoadmapState, title: string): string {
  let content = createRoadmapDocument(title);

  for (const node of Object.values(state.nodes)) {
    content = insertNodeBlock(content, node);
  }

  for (const cluster of Object.values(state.clusters)) {
    const memberIds = Object.values(state.nodes)
      .filter((node) => node.clusterId === cluster.id)
      .map((node) => node.id);

    content = writeClusterSection(content, cluster, memberIds);
  }

  return writeState(writeRelations(content, state), state);
}
