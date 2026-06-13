import type { RoadmapNodeSource } from "./types";

/**
 * Vault path a node points at, or null for sources that are not backed by a file
 * (inline text and external URLs). Used to check whether the source still exists.
 */
export function sourceFile(source: RoadmapNodeSource): string | null {
  switch (source.type) {
    case "note":
    case "heading":
    case "block":
    case "image":
    case "attachment":
      return source.file;
    case "text":
    case "url":
      return null;
  }
}
