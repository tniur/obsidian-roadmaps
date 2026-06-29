import type { RoadmapNode } from "./types";

export type NodeOpenTarget = { kind: "link"; linktext: string } | { kind: "url"; url: string };

export function nodeOpenTarget(node: RoadmapNode): NodeOpenTarget | null {
  const source = node.source;

  switch (source.type) {
    case "note":
    case "image":
    case "attachment":
      return { kind: "link", linktext: source.file };
    case "heading":
      return { kind: "link", linktext: `${source.file}#${source.heading}` };
    case "block":
      return { kind: "link", linktext: `${source.file}#^${source.blockId}` };
    case "url":
      return { kind: "url", url: source.url };
    case "text":
      return null;
  }
}
