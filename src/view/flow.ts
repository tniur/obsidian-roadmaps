import type { Edge, Node } from "@xyflow/react";
import { COLLAPSED_CLUSTER_HEIGHT } from "../constants";
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

export const ROADMAP_CLUSTER_TYPE = "roadmapCluster";

export const ROADMAP_EDGE_TYPE = "floating";

export interface RoadmapNodeData {
  label: string;
  title?: string;
  description?: string;
  kind: RoadmapNodeKind;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
  color?: string;
  align?: TextAlign;
  missing?: boolean;
  imageSrc?: string;
  [key: string]: unknown;
}

export interface RoadmapClusterData {
  label: string;
  color?: string;
  collapsed?: boolean;
  [key: string]: unknown;
}

export type RoadmapFlowNode = Node<RoadmapNodeData>;

export type NodeMissingPredicate = (node: RoadmapNode) => boolean;

export type NodeImageResolver = (node: RoadmapNode) => string | null;

/**
 * Flat React Flow node list with cluster containers first (parents must precede children).
 * A clustered node renders as a child of its cluster, so its stored layout is relative to the
 * cluster origin (cluster layout is absolute).
 */
export function stateToFlowNodes(
  state: RoadmapState,
  isMissing?: NodeMissingPredicate,
  resolveImageSrc?: NodeImageResolver,
): RoadmapFlowNode[] {
  const clusters = Object.values(state.clusters).map(
    (cluster) =>
      ({
        id: cluster.id,
        type: ROADMAP_CLUSTER_TYPE,
        position: { x: cluster.layout.x, y: cluster.layout.y },
        width: cluster.layout.width,
        height: cluster.collapsed === true ? COLLAPSED_CLUSTER_HEIGHT : cluster.layout.height,
        deletable: false,
        data: {
          label: cluster.title,
          color: cluster.style?.color,
          collapsed: cluster.collapsed === true,
        },
      }) as unknown as RoadmapFlowNode,
  );
  const nodes = Object.values(state.nodes).map((node) => {
    const cluster = node.clusterId != null ? state.clusters[node.clusterId] : undefined;
    const flow: RoadmapFlowNode = {
      id: node.id,
      type: ROADMAP_NODE_TYPE,
      position: { x: node.layout.x, y: node.layout.y },
      width: node.layout.width,
      height: node.layout.height,
      data: {
        label: nodeTitle(node),
        title: node.title,
        description: node.description,
        kind: node.kind,
        status: node.status,
        priority: node.priority,
        color: node.style?.color,
        align: node.align,
        missing: isMissing?.(node) ?? false,
        imageSrc: resolveImageSrc?.(node) ?? undefined,
      },
    };

    if (cluster !== undefined) {
      flow.parentId = node.clusterId as string;
      flow.hidden = cluster.collapsed === true;
    }

    return flow;
  });

  return [...clusters, ...nodes];
}

export function reconcileFlowNodes(current: RoadmapFlowNode[], next: RoadmapFlowNode[]): RoadmapFlowNode[] {
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
      parentId: node.parentId,
      hidden: node.hidden,
      data: node.data,
    };
  });
}

export function stateToFlowEdges(state: RoadmapState): Edge[] {
  return Object.values(state.edges).map((edge) => ({
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
