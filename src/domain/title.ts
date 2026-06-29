import type { RoadmapNode } from "./types";

function basename(path: string): string {
  const file = path.split("/").pop() ?? path;

  return file.replace(/\.[^.]+$/, "");
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function nodeTitle(node: RoadmapNode): string {
  if (node.title !== undefined && node.title.length > 0) {
    return node.title;
  }

  const source = node.source;

  switch (source.type) {
    case "note":
      return basename(source.file);
    case "heading":
      return source.heading;
    case "block":
      return `${basename(source.file)} ^${source.blockId}`;
    case "text":
      return "Text";
    case "image":
      return basename(source.file);
    case "attachment":
      return basename(source.file);
    case "url":
      return hostname(source.url);
  }
}
