import { nodeTitle } from "../domain/title";
import type { RoadmapNode, RoadmapNodeSource } from "../domain/types";

function stripExtension(path: string): string {
  return path.replace(/\.md$/, "");
}

function wikilink(target: string, title: string): string {
  return `[[${target}|${title}]]`;
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
      return `[${title}](${source.url})`;
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

function representation(node: RoadmapNode): string {
  const title = nodeTitle(node);
  if (node.source.type === "image") {
    return sourceLink(node.source, title);
  }
  const link = sourceLink(node.source, title);
  const suffix = tags(node);

  return suffix.length > 0 ? `- [ ] ${link} ${suffix}` : `- [ ] ${link}`;
}

export function renderNodeBlock(node: RoadmapNode): string {
  return `<!-- roadmap-node:id=${node.id} type=${node.kind} -->\n${representation(node)}`;
}
