import type { Node } from "@xyflow/react";
import { nodeTitle } from "../domain/title";
import type {
  RoadmapNodeKind,
  RoadmapPriority,
  RoadmapState,
  RoadmapStatus,
} from "../domain/types";

export const ROADMAP_NODE_TYPE = "roadmapNode";

export interface RoadmapNodeData {
  label: string;
  description?: string;
  kind: RoadmapNodeKind;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
  color?: string;
  [key: string]: unknown;
}

export type RoadmapFlowNode = Node<RoadmapNodeData>;

export function stateToFlowNodes(state: RoadmapState): RoadmapFlowNode[] {
  return Object.values(state.nodes).map((node) => ({
    id: node.id,
    type: ROADMAP_NODE_TYPE,
    position: { x: node.layout.x, y: node.layout.y },
    data: {
      label: nodeTitle(node),
      description: node.description,
      kind: node.kind,
      status: node.status,
      priority: node.priority,
      color: node.style?.color,
    },
  }));
}

export function reconcileFlowNodes(
  current: RoadmapFlowNode[],
  next: RoadmapFlowNode[],
): RoadmapFlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));

  return next.map((node) => {
    const existing = currentById.get(node.id);

    return existing === undefined ? node : { ...existing, data: node.data };
  });
}
