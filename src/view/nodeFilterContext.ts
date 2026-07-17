import { createContext, useContext } from "react";
import type { RoadmapPriority, RoadmapStatus } from "../domain/types";

/** True when a node with this status/priority should be dimmed by the active filter. */
export type NodeDimPredicate = (status: RoadmapStatus | undefined, priority: RoadmapPriority | undefined) => boolean;

export interface NodeFilterState {
  dimmed: NodeDimPredicate;
  /** True while any filter chip is on; clusters dim wholesale — they are not filterable. */
  active: boolean;
}

export const NodeFilterContext = createContext<NodeFilterState>({ dimmed: () => false, active: false });

export function useNodeDimmed(): NodeDimPredicate {
  return useContext(NodeFilterContext).dimmed;
}

export function useFilterActive(): boolean {
  return useContext(NodeFilterContext).active;
}
