import type { RoadmapState, RoadmapStatus } from "./types";
import { ROADMAP_STATUSES } from "./types";

/** Status bucket for the progress summary: the node statuses plus an explicit "no status" bucket. */
export type ProgressBucket = RoadmapStatus | "none";

export const PROGRESS_BUCKETS: readonly ProgressBucket[] = [...ROADMAP_STATUSES, "none"];

/** Completion summary of a board's nodes: total, per-bucket counts and the done share. */
export interface BoardProgress {
  total: number;
  done: number;
  donePercent: number;
  counts: Record<ProgressBucket, number>;
}

/** Tallies nodes by status; `donePercent` is the rounded share of "done" nodes, 0 on an empty board. */
export function boardProgress(state: RoadmapState): BoardProgress {
  const counts: Record<ProgressBucket, number> = { draft: 0, "in-progress": 0, done: 0, archived: 0, none: 0 };

  const nodes = Object.values(state.nodes);

  for (const node of nodes) {
    counts[node.status ?? "none"] += 1;
  }

  const total = nodes.length;
  const done = counts.done;

  return { total, done, donePercent: total === 0 ? 0 : Math.round((done / total) * 100), counts };
}
