import { sourceFile } from "./source";
import { nodeTitle } from "./title";
import type { RoadmapNode, RoadmapState } from "./types";

/** Lowercased haystack for a node: visible title, description and source (file / URL / text). */
export function nodeSearchText(node: RoadmapNode): string {
  const parts: string[] = [nodeTitle(node)];

  if (node.description !== undefined) {
    parts.push(node.description);
  }

  const file = sourceFile(node.source);

  if (file !== null) {
    parts.push(file);
  } else if (node.source.type === "url") {
    parts.push(node.source.url);
  }

  return parts.join(" ").toLowerCase();
}

function absolutePosition(state: RoadmapState, node: RoadmapNode): { x: number; y: number } {
  if (node.clusterId != null) {
    const cluster = state.clusters[node.clusterId];

    if (cluster !== undefined) {
      return { x: cluster.layout.x + node.layout.x, y: cluster.layout.y + node.layout.y };
    }
  }

  return { x: node.layout.x, y: node.layout.y };
}

/**
 * Ids of nodes matching every whitespace-separated term of `query`, ordered top-to-bottom
 * then left-to-right by absolute position. Members of a collapsed cluster are skipped — a
 * result the user cannot see would be confusing. An empty query yields no results.
 */
export function searchNodes(state: RoadmapState, query: string): string[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  if (terms.length === 0) {
    return [];
  }

  const collapsed = new Set(
    Object.values(state.clusters)
      .filter((cluster) => cluster.collapsed === true)
      .map((cluster) => cluster.id),
  );

  return Object.values(state.nodes)
    .filter((node) => {
      if (node.clusterId != null && collapsed.has(node.clusterId)) {
        return false;
      }

      const text = nodeSearchText(node);

      return terms.every((term) => text.includes(term));
    })
    .map((node) => ({ id: node.id, ...absolutePosition(state, node) }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((entry) => entry.id);
}
