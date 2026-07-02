import { nodeTitle } from "../domain/title";
import type { EdgeDirection, RoadmapEndpoint, RoadmapState } from "../domain/types";
import { encodeMarkdownUrl, sanitizeAlias, sanitizeInline } from "./sanitize";

const RELATIONS_HEADING = "## Relations";

function stripExtension(path: string): string {
  return path.replace(/\.md$/, "");
}

function endpointLink(state: RoadmapState, endpoint: RoadmapEndpoint): string | null {
  if (endpoint.type === "cluster") {
    const cluster = state.clusters[endpoint.id];

    return cluster === undefined ? null : `[[#${sanitizeAlias(cluster.title)}]]`;
  }

  const node = state.nodes[endpoint.id];

  if (node === undefined) {
    return null;
  }

  const title = sanitizeAlias(nodeTitle(node));
  const source = node.source;

  switch (source.type) {
    case "note":
      return `[[${stripExtension(source.file)}|${title}]]`;
    case "heading":
      return `[[${stripExtension(source.file)}#${source.heading}|${title}]]`;
    case "block":
      return `[[${stripExtension(source.file)}#^${source.blockId}|${title}]]`;
    case "image":
    case "attachment":
      return `[[${source.file}|${title}]]`;
    case "url":
      return `[${title}](${encodeMarkdownUrl(source.url)})`;
    case "text":
      return title;
  }
}

export function renderRelationsSection(state: RoadmapState): string | null {
  const lines: string[] = [];

  for (const edge of Object.values(state.edges)) {
    const from = endpointLink(state, edge.from);
    const to = endpointLink(state, edge.to);

    if (from === null || to === null) {
      continue;
    }

    const arrow = edge.direction === "both" ? "<->" : edge.direction === "forward" ? "->" : "--";
    const label = edge.label !== undefined && edge.label.length > 0 ? `: ${sanitizeInline(edge.label)}` : "";

    lines.push(`- ${from} ${arrow} ${to}${label} <!-- roadmap-edge:id=${edge.id} -->`);
  }

  if (lines.length === 0) {
    return null;
  }

  return [RELATIONS_HEADING, "", ...lines].join("\n");
}

export interface ParsedRelationEndpoint {
  clusterTitle?: string;
  linkTarget?: string;
  linkAlias?: string;
  url?: string;
  text?: string;
}

export interface ParsedRelationLine {
  id: string;
  from: ParsedRelationEndpoint;
  to: ParsedRelationEndpoint;
  direction: EdgeDirection;
  label?: string;
}

const RELATION_LINE_RE = /^-\s+(.*?)\s+(<->|->|--)\s+(.*?)\s*<!-- roadmap-edge:id=(\S+) -->\s*$/;

function parseEndpoint(raw: string): { endpoint: ParsedRelationEndpoint; rest: string } {
  const heading = /^\[\[#([^\]|]+)\]\]/.exec(raw);

  if (heading !== null) {
    return { endpoint: { clusterTitle: heading[1] }, rest: raw.slice(heading[0].length) };
  }

  const wikilink = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(raw);

  if (wikilink !== null) {
    return { endpoint: { linkTarget: wikilink[1], linkAlias: wikilink[2] }, rest: raw.slice(wikilink[0].length) };
  }

  const mdLink = /^\[([^\]]*)\]\(([^)]+)\)/.exec(raw);

  if (mdLink !== null) {
    return { endpoint: { url: mdLink[2] }, rest: raw.slice(mdLink[0].length) };
  }

  return { endpoint: { text: raw }, rest: "" };
}

/**
 * Best-effort inverse of `renderRelationsSection` for a single line, used to rebuild
 * edges from the readable body when the hidden state block is lost. Endpoint identity
 * is resolved against rebuilt nodes by the caller.
 */
export function parseRelationsLine(line: string): ParsedRelationLine | null {
  const match = RELATION_LINE_RE.exec(line);

  if (match === null) {
    return null;
  }

  const direction: EdgeDirection = match[2] === "<->" ? "both" : match[2] === "->" ? "forward" : "none";
  const from = parseEndpoint(match[1]).endpoint;
  const target = parseEndpoint(match[3]);
  const label = target.rest.replace(/^:\s*/, "").trim();
  const result: ParsedRelationLine = { id: match[4], from, to: target.endpoint, direction };

  if (label.length > 0) {
    result.label = label;
  }

  return result;
}
