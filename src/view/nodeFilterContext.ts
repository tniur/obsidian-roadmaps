import { createContext, useContext } from "react";
import type { RoadmapPriority, RoadmapStatus } from "../domain/types";

/** True when a node with this status/priority should be dimmed by the active filter. */
export type NodeDimPredicate = (status: RoadmapStatus | undefined, priority: RoadmapPriority | undefined) => boolean;

export const NodeFilterContext = createContext<NodeDimPredicate>(() => false);

export function useNodeDimmed(): NodeDimPredicate {
  return useContext(NodeFilterContext);
}
