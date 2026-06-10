import { nanoid } from "nanoid";
import {
  ROADMAP_FRONTMATTER_KEY,
  ROADMAP_FRONTMATTER_VALUE,
  ROADMAP_SCHEMA_VERSION,
} from "../constants";
import type { RoadmapNode, RoadmapState } from "../domain/types";
import { renderNodeBlock } from "../markdown/nodeBlock";
import { parseState, serializeState } from "./codec";

const FIRST_HEADING_RE = /^## /m;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const STATE_BLOCK_RE =
  /%%[ \t]*roadmap:state[ \t]*\r?\n```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\r?\n[ \t]*%%/;

const NODE_BOUNDARY_RE = /<!-- roadmap-node:id=\S+ type=\w+ -->|^## |%%[ \t]*roadmap:state/m;

const NODE_MARKER_RE = /<!-- roadmap-node:id=(\S+) type=\w+ -->/g;

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

export function bodyNodeIds(content: string): Set<string> {
  const ids = new Set<string>();
  for (const match of content.matchAll(NODE_MARKER_RE)) {
    ids.add(match[1]);
  }

  return ids;
}

export function reconcileState(state: RoadmapState, content: string): RoadmapState {
  const present = bodyNodeIds(content);
  const nodes: Record<string, RoadmapNode> = {};
  let changed = false;
  for (const [id, node] of Object.entries(state.nodes)) {
    if (present.has(id)) {
      nodes[id] = node;
    } else {
      changed = true;
    }
  }

  return changed ? { ...state, nodes } : state;
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
