import { fileBasename, fileName, urlHostname } from "./paths";
import type { RoadmapCluster, RoadmapNode } from "./types";

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
      return fileName(source.file);
    case "url":
      return urlHostname(source.url);
  }
}

/**
 * Source identity under the preview-panel title: the file name with its extension for
 * file-backed nodes, the hostname for URLs. Text nodes have no source and yield nothing.
 */
export function nodeSourceLabel(node: RoadmapNode): string | undefined {
  const source = node.source;

  switch (source.type) {
    case "note":
    case "heading":
    case "block":
    case "image":
    case "attachment":
      return fileName(source.file);
    case "url":
      return urlHostname(source.url);
    case "text":
      return undefined;
  }
}

/**
 * Secondary source line of a card: the full address without its scheme for URL nodes,
 * the file name for attachments (a fallback when no vault file info is available).
 * Suppressed when it would just repeat the display title.
 */
export function nodeSecondary(node: RoadmapNode): string | undefined {
  const source = node.source;
  const secondary =
    source.type === "url"
      ? source.url.replace(/^https?:\/\//i, "").replace(/\/$/, "")
      : source.type === "attachment"
        ? fileName(source.file)
        : undefined;

  return secondary === undefined || secondary === nodeTitle(node) ? undefined : secondary;
}

/** Sentence-case label of a kebab-case domain value: "in-progress" → "In progress". */
export function humanizeValue(value: string): string {
  const text = value.replace(/-/g, " ");

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Obsidian resolves heading links case-insensitively, so titles must differ that way too. */
export function clusterTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

/** First free variant of `title` against the taken keys: "Q3" → "Q3 2" → "Q3 3". */
export function firstFreeTitle(title: string, takenKeys: ReadonlySet<string>): string {
  if (!takenKeys.has(clusterTitleKey(title))) {
    return title;
  }

  for (let counter = 2; ; counter += 1) {
    const candidate = `${title} ${counter}`;

    if (!takenKeys.has(clusterTitleKey(candidate))) {
      return candidate;
    }
  }
}

/**
 * Heading links (`[[#Title]]`) address clusters by title, so titles must be unique within
 * one roadmap. A taken title gets the first free numeric suffix.
 */
export function uniqueClusterTitle(
  title: string,
  clusters: Record<string, RoadmapCluster>,
  excludeId?: string,
): string {
  const taken = new Set(
    Object.values(clusters)
      .filter((cluster) => cluster.id !== excludeId)
      .map((cluster) => clusterTitleKey(cluster.title)),
  );

  return firstFreeTitle(title, taken);
}
