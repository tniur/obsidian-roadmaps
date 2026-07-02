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

export type RoadmapNodeData = {
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
};

export type RoadmapClusterData = {
  label: string;
  color?: string;
  collapsed: boolean;
};

export type RoadmapCardNode = Node<RoadmapNodeData, typeof ROADMAP_NODE_TYPE>;

export type RoadmapClusterNode = Node<RoadmapClusterData, typeof ROADMAP_CLUSTER_TYPE>;

export type RoadmapFlowNode = RoadmapCardNode | RoadmapClusterNode;

export function isCardNode(node: RoadmapFlowNode): node is RoadmapCardNode {
  return node.type === ROADMAP_NODE_TYPE;
}

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
    (cluster): RoadmapClusterNode => ({
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
    }),
  );
  const nodes = Object.values(state.nodes).map((node): RoadmapCardNode => {
    const cluster = node.clusterId != null ? state.clusters[node.clusterId] : undefined;
    const flow: RoadmapCardNode = {
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

/**
 * Shallow equality over node/cluster card content. Extra keys on either shape resolve to
 * undefined on the other, so one comparator covers both node and cluster data records.
 */
function flowDataEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const alignA = a.align as TextAlign | undefined;
  const alignB = b.align as TextAlign | undefined;

  return (
    a.label === b.label &&
    a.title === b.title &&
    a.description === b.description &&
    a.kind === b.kind &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.color === b.color &&
    a.missing === b.missing &&
    a.imageSrc === b.imageSrc &&
    a.collapsed === b.collapsed &&
    alignA?.h === alignB?.h &&
    alignA?.v === alignB?.v
  );
}

/**
 * Merges freshly derived flow nodes into the current list, preserving object identity
 * for nodes that did not change. React Flow re-renders per element by reference, so on
 * a large board an unrelated mutation leaves untouched cards alone instead of
 * re-rendering all of them.
 */
export function reconcileFlowNodes(current: RoadmapFlowNode[], next: RoadmapFlowNode[]): RoadmapFlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));

  return next.map((node) => {
    const existing = currentById.get(node.id);

    if (existing === undefined || existing.type !== node.type) {
      return node;
    }

    const dataEqual = flowDataEqual(existing.data, node.data);

    if (existing.dragging === true) {
      if (dataEqual) {
        return existing;
      }

      return {
        ...node,
        position: existing.position,
        width: existing.width,
        height: existing.height,
        parentId: existing.parentId,
        hidden: existing.hidden,
        selected: existing.selected,
        dragging: existing.dragging,
        measured: existing.measured,
      };
    }

    const same =
      dataEqual &&
      existing.position.x === node.position.x &&
      existing.position.y === node.position.y &&
      existing.width === node.width &&
      existing.height === node.height &&
      existing.parentId === node.parentId &&
      existing.hidden === node.hidden;

    if (same) {
      return existing;
    }

    return { ...node, selected: existing.selected, measured: existing.measured };
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

function edgeDataEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  return (
    a?.direction === b?.direction &&
    a?.line === b?.line &&
    a?.fromSide === b?.fromSide &&
    a?.toSide === b?.toSide &&
    a?.label === b?.label
  );
}

/**
 * Same identity-preserving merge as `reconcileFlowNodes`, for edges. Also carries the
 * ephemeral `selected` flag over to changed edges, so an unrelated commit no longer
 * drops the current edge selection.
 */
export function reconcileFlowEdges(current: Edge[], next: Edge[]): Edge[] {
  const currentById = new Map(current.map((edge) => [edge.id, edge]));

  return next.map((edge) => {
    const existing = currentById.get(edge.id);

    if (existing === undefined) {
      return edge;
    }

    const same =
      existing.source === edge.source &&
      existing.target === edge.target &&
      existing.sourceHandle === edge.sourceHandle &&
      existing.targetHandle === edge.targetHandle &&
      edgeDataEqual(existing.data, edge.data);

    if (same) {
      return existing;
    }

    return existing.selected === undefined ? edge : { ...edge, selected: existing.selected };
  });
}
