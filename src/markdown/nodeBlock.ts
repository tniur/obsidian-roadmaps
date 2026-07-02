import { nanoid } from "nanoid";
import { nodeTitle } from "../domain/title";
import type { RoadmapNode, RoadmapNodeKind, RoadmapNodeSource, RoadmapPriority, RoadmapStatus } from "../domain/types";
import { encodeMarkdownUrl, escapeTextContent, sanitizeAlias, sanitizeInline, unescapeTextContent } from "./sanitize";

function stripExtension(path: string): string {
  return path.replace(/\.md$/, "");
}

function wikilink(target: string, title: string): string {
  return `[[${target}|${sanitizeAlias(title)}]]`;
}

function sourceLink(source: RoadmapNodeSource, title: string): string {
  switch (source.type) {
    case "note":
      return wikilink(stripExtension(source.file), title);
    case "heading":
      return wikilink(`${stripExtension(source.file)}#${source.heading}`, title);
    case "block":
      return wikilink(`${stripExtension(source.file)}#^${source.blockId}`, title);
    case "image":
      return `![[${source.file}]]`;
    case "attachment":
      return wikilink(source.file, title);
    case "url":
      return `[${sanitizeAlias(title)}](${encodeMarkdownUrl(source.url)})`;
    case "text":
      return title;
  }
}

function tags(node: RoadmapNode): string {
  const parts: string[] = [];

  if (node.status !== undefined) parts.push(`#${node.status}`);
  if (node.priority !== undefined) parts.push(`#${node.priority}`);

  return parts.join(" ");
}

/** Readable body of a node block (everything after the marker line). Also serves as the
 * dirty-check baseline: a body block differing from this was edited by hand. */
export function renderNodeRepresentation(node: RoadmapNode): string {
  const title = nodeTitle(node);

  if (node.source.type === "text") {
    return escapeTextContent(title);
  }

  const lines: string[] = [];

  if (node.source.type === "image") {
    lines.push(sourceLink(node.source, title));

    if (node.title !== undefined && node.title.length > 0) {
      lines.push(`**${sanitizeInline(node.title)}**`);
    }
  } else {
    const link = sourceLink(node.source, title);
    const suffix = tags(node);

    lines.push(suffix.length > 0 ? `- [ ] ${link} ${suffix}` : `- [ ] ${link}`);
  }

  if (node.description !== undefined && node.description.length > 0) {
    lines.push(sanitizeInline(node.description));
  }

  return lines.join("\n");
}

export function renderNodeBlock(node: RoadmapNode): string {
  return `<!-- roadmap-node:id=${node.id} type=${node.kind} -->\n${renderNodeRepresentation(node)}`;
}

const STATUS_VALUES = new Set<string>(["draft", "in-progress", "done", "archived"]);

const PRIORITY_VALUES = new Set<string>(["low", "medium", "high", "critical"]);

const LIST_LINK_RE = /^(?:- \[[ xX]\] )?(.*)$/;

const WIKILINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/;

const MD_LINK_RE = /^\[([^\]]*)\]\(([^)]+)\)/;

const BOLD_LINE_RE = /^\*\*(.+)\*\*$/;

export interface ParsedNodeBlock {
  source: RoadmapNodeSource;
  title?: string;
  description?: string;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
}

function basename(path: string): string {
  const file = path.split("/").pop() ?? path;

  return file.replace(/\.[^.]+$/, "");
}

function noteFilePath(target: string): string {
  return target.endsWith(".md") ? target : `${target}.md`;
}

function urlHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface ParsedTags {
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
}

function parseTags(rest: string): ParsedTags {
  const result: ParsedTags = {};

  for (const match of rest.matchAll(/#([\w-]+)/g)) {
    if (STATUS_VALUES.has(match[1])) {
      result.status = match[1] as RoadmapStatus;
    } else if (PRIORITY_VALUES.has(match[1])) {
      result.priority = match[1] as RoadmapPriority;
    }
  }

  return result;
}

/**
 * Best-effort inverse of `renderNodeBlock`'s representation, used to rebuild state
 * entries from the readable body when the hidden state block is lost. Returns null
 * when the block does not carry enough to reconstruct the node's source.
 */
export function parseNodeBlock(kind: RoadmapNodeKind, body: string): ParsedNodeBlock | null {
  if (kind === "text") {
    const text = unescapeTextContent(body.trim());

    return { source: { type: "text", markdownNodeId: nanoid() }, title: text.length > 0 ? text : undefined };
  }

  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const first = lines[0] ?? "";

  if (kind === "image") {
    const embed = /^!\[\[([^\]|]+)\]\]/.exec(first);

    if (embed === null) {
      return null;
    }

    const result: ParsedNodeBlock = { source: { type: "image", file: embed[1] } };
    const bold = lines[1] !== undefined ? BOLD_LINE_RE.exec(lines[1]) : null;

    if (bold !== null) {
      result.title = bold[1];
    }

    const descriptionLine = bold !== null ? lines[2] : lines[1];

    if (descriptionLine !== undefined) {
      result.description = descriptionLine;
    }

    return result;
  }

  const content = LIST_LINK_RE.exec(first)?.[1] ?? first;

  if (kind === "url") {
    const link = MD_LINK_RE.exec(content);

    if (link === null) {
      return null;
    }

    const result: ParsedNodeBlock = { source: { type: "url", url: link[2] }, ...parseTags(content) };

    if (link[1].length > 0 && link[1] !== urlHostname(link[2])) {
      result.title = link[1];
    }

    if (lines[1] !== undefined) {
      result.description = lines[1];
    }

    return result;
  }

  const link = WIKILINK_RE.exec(content);

  if (link === null) {
    return null;
  }

  const target = link[1];
  const alias = link[2];
  let source: RoadmapNodeSource;

  if (kind === "block" || target.includes("#^")) {
    const [file, block] = target.split("#^");

    if (block === undefined || block.length === 0) {
      return null;
    }

    source = { type: "block", file: noteFilePath(file), blockId: block };
  } else if (kind === "heading" || target.includes("#")) {
    const [file, heading] = target.split("#");

    if (heading === undefined || heading.length === 0) {
      return null;
    }

    source = { type: "heading", file: noteFilePath(file), heading };
  } else if (kind === "attachment") {
    source = { type: "attachment", file: target };
  } else {
    source = { type: "note", file: noteFilePath(target) };
  }

  const result: ParsedNodeBlock = { source, ...parseTags(content) };

  if (alias !== undefined && alias.length > 0 && alias !== basename(target)) {
    result.title = alias;
  }

  if (lines[1] !== undefined) {
    result.description = lines[1];
  }

  return result;
}
