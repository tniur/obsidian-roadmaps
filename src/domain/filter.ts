import type { RoadmapNode } from "./types";

/** Selected status/priority values; a `none` entry matches nodes without that field. */
export interface NodeFilter {
  statuses: ReadonlySet<string>;
  priorities: ReadonlySet<string>;
}

/** Chip value standing in for a missing status or priority. */
export const FILTER_NONE = "none";

export function filterIsActive(filter: NodeFilter): boolean {
  return filter.statuses.size > 0 || filter.priorities.size > 0;
}

/** An empty category imposes no constraint; otherwise the value (or `none`) must be selected. */
function passes(value: string | undefined, selected: ReadonlySet<string>): boolean {
  return selected.size === 0 || selected.has(value ?? FILTER_NONE);
}

export function nodeMatchesFilter(node: Pick<RoadmapNode, "status" | "priority">, filter: NodeFilter): boolean {
  return passes(node.status, filter.statuses) && passes(node.priority, filter.priorities);
}
