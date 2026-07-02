import { fileBasename, urlHostname } from "./paths";
import type { RoadmapNode } from "./types";

export function nodeTitle(node: RoadmapNode): string {
  if (node.title !== undefined && node.title.length > 0) {
    return node.title;
  }

  const source = node.source;

  switch (source.type) {
    case "note":
      return fileBasename(source.file);
    case "heading":
      return source.heading;
    case "block":
      return `${fileBasename(source.file)} ^${source.blockId}`;
    case "text":
      return "Text";
    case "image":
      return fileBasename(source.file);
    case "attachment":
      return fileBasename(source.file);
    case "url":
      return urlHostname(source.url);
  }
}
