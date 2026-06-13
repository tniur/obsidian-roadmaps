import type { Edge, Node } from "@xyflow/react";
import { nodeTitle } from "../domain/title";
import type {
  RoadmapNode,
  RoadmapNodeKind,
  RoadmapPriority,
  RoadmapState,
  RoadmapStatus,
  TextAlign,
} from "../domain/types";

export const ROADMAP_NODE_TYPE = "roadmapNode";

export const ROADMAP_EDGE_TYPE = "floating";

export interface RoadmapNodeData {
  label: string;
  description?: string;
  kind: RoadmapNodeKind;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
  color?: string;
  align?: TextAlign;
  missing?: boolean;
  [key: string]: unknown;
}

export type RoadmapFlowNode = Node<RoadmapNodeData>;

export type NodeMissingPredicate = (node: RoadmapNode) => boolean;

export function stateToFlowNodes(
  state: RoadmapState,
  isMissing?: NodeMissingPredicate,
): RoadmapFlowNode[] {
  return Object.values(state.nodes).map((node) => ({
    id: node.id,
    type: ROADMAP_NODE_TYPE,
    position: { x: node.layout.x, y: node.layout.y },
    width: node.layout.width,
    height: node.layout.height,
    data: {
      label: nodeTitle(node),
      description: node.description,
      kind: node.kind,
      status: node.status,
      priority: node.priority,
      color: node.style?.color,
      align: node.align,
      missing: isMissing?.(node) ?? false,
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
    if (existing === undefined) {
      return node;
    }
    if (existing.dragging === true) {
      return { ...existing, data: node.data };
    }

    return {
      ...existing,
      position: node.position,
      width: node.width,
      height: node.height,
      data: node.data,
    };
  });
}

export function stateToFlowEdges(state: RoadmapState): Edge[] {
  return Object.values(state.edges)
    .filter((edge) => edge.from.type === "node" && edge.to.type === "node")
    .map((edge) => ({
      id: edge.id,
      source: edge.from.id,
      target: edge.to.id,
      sourceHandle: edge.fromSide ?? null,
      targetHandle: edge.toSide ?? null,
      type: ROADMAP_EDGE_TYPE,
      data: {
        direction: edge.direction,
        line: edge.style?.line,
        fromSide: edge.fromSide,
        toSide: edge.toSide,
        label: edge.label,
      },
    }));
}
