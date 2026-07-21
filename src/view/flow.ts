import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import { COLLAPSED_CLUSTER_HEIGHT } from "../constants";
import { nodeSecondary, nodeTitle } from "../domain/title";
import type {
  EdgeDirection,
  EdgeLine,
  EdgeShape,
  EdgeSide,
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

/**
 * Render data for a node card. `displayTitle` is the custom title when set, else derived from the
 * source; `customTitle` is the explicit user title only; `secondary` is the source hint under it.
 */
export type RoadmapNodeData = {
  displayTitle: string;
  customTitle?: string;
  secondary?: string;
  description?: string;
  kind: RoadmapNodeKind;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
  color?: string;
  align?: TextAlign;
  missing?: boolean;
  imageSrc?: string;
  url?: string;
};

/** Render data for a cluster container; `count` of 0 renders the empty placeholder. */
export type RoadmapClusterData = {
  title: string;
  color?: string;
  collapsed: boolean;
  count: number;
};

export type RoadmapEdgeData = {
  direction: EdgeDirection;
  line?: EdgeLine;
  shape?: EdgeShape;
  color?: string;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  label?: string;
};

export type RoadmapCardNode = Node<RoadmapNodeData, typeof ROADMAP_NODE_TYPE>;

export type RoadmapClusterNode = Node<RoadmapClusterData, typeof ROADMAP_CLUSTER_TYPE>;

export type RoadmapFlowNode = RoadmapCardNode | RoadmapClusterNode;

export type RoadmapFlowEdge = Edge<RoadmapEdgeData, typeof ROADMAP_EDGE_TYPE>;

export type RoadmapFlowInstance = ReactFlowInstance<RoadmapFlowNode, RoadmapFlowEdge>;

export function isCardNode(node: RoadmapFlowNode): node is RoadmapCardNode {
  return node.type === ROADMAP_NODE_TYPE;
}

/** Structural frame of a rendered node; also matches the export snapshot shape. */
export interface FlowNodeFrame {
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
}

/** Rendered size of a node: the measured DOM size when available, else the stored one. */
export function nodeSize(frame: FlowNodeFrame): { width: number; height: number } {
  return {
    width: frame.measured?.width ?? frame.width ?? 0,
    height: frame.measured?.height ?? frame.height ?? 0,
  };
}

/** Containment test in the node's own coordinate space (children are cluster-relative). */
export function nodeContainsPoint(frame: FlowNodeFrame, point: { x: number; y: number }): boolean {
  const { width, height } = nodeSize(frame);

  return (
    point.x >= frame.position.x &&
    point.x <= frame.position.x + width &&
    point.y >= frame.position.y &&
    point.y <= frame.position.y + height
  );
}

/**
 * A rubber-band that touches a cluster container selects the cluster as a whole: its
 * members drop out of the selection so the group acts as one object (delete, drag).
 * Directly clicked members stay selectable — their cluster is not selected then.
 */
export function normalizeClusterSelection(nodes: RoadmapFlowNode[]): RoadmapFlowNode[] {
  const selectedClusters = new Set(
    nodes.filter((node) => node.type === ROADMAP_CLUSTER_TYPE && node.selected === true).map((node) => node.id),
  );

  if (selectedClusters.size === 0) {
    return nodes;
  }

  let changed = false;
  const result = nodes.map((node) => {
    if (node.selected === true && node.parentId != null && selectedClusters.has(node.parentId)) {
      changed = true;

      return { ...node, selected: false };
    }

    return node;
  });

  return changed ? result : nodes;
}

/** Absolute position of a flow node: cluster members store cluster-relative coordinates. */
export function absoluteNodePosition(node: RoadmapFlowNode, all: readonly RoadmapFlowNode[]): { x: number; y: number } {
  const parent = node.parentId == null ? undefined : all.find((entry) => entry.id === node.parentId);

  return { x: (parent?.position.x ?? 0) + node.position.x, y: (parent?.position.y ?? 0) + node.position.y };
}

/**
 * Whether a visible node covers the point (absolute flow coords). Hidden collapsed members
 * are ignored, so "connect to empty" still opens over their invisible area; members are
 * tested at their absolute position, not their cluster-relative one.
 */
export function pointOverVisibleNode(nodes: readonly RoadmapFlowNode[], point: { x: number; y: number }): boolean {
  return nodes.some(
    (node) =>
      node.hidden !== true && nodeContainsPoint({ ...node, position: absoluteNodePosition(node, nodes) }, point),
  );
}

export type NodeMissingPredicate = (node: RoadmapNode) => boolean;

export type NodeImageResolver = (node: RoadmapNode) => string | null;

/** Vault-backed source line ("2.4 MB · PDF"); falls back to the domain's nodeSecondary. */
export type NodeFileInfoResolver = (node: RoadmapNode) => string | undefined;

/**
 * Flat React Flow node list with cluster containers first (parents must precede children).
 * A clustered node renders as a child of its cluster, so its stored layout is relative to the
 * cluster origin (cluster layout is absolute).
 */
export function stateToFlowNodes(
  state: RoadmapState,
  isMissing?: NodeMissingPredicate,
  resolveImageSrc?: NodeImageResolver,
  resolveFileInfo?: NodeFileInfoResolver,
): RoadmapFlowNode[] {
  const memberCounts = new Map<string, number>();

  for (const node of Object.values(state.nodes)) {
    if (node.clusterId != null) {
      memberCounts.set(node.clusterId, (memberCounts.get(node.clusterId) ?? 0) + 1);
    }
  }

  const clusters = Object.values(state.clusters).map(
    (cluster): RoadmapClusterNode => ({
      id: cluster.id,
      type: ROADMAP_CLUSTER_TYPE,
      position: { x: cluster.layout.x, y: cluster.layout.y },
      width: cluster.layout.width,
      height: cluster.collapsed === true ? COLLAPSED_CLUSTER_HEIGHT : cluster.layout.height,
      data: {
        title: cluster.title,
        color: cluster.style?.color,
        collapsed: cluster.collapsed === true,
        count: memberCounts.get(cluster.id) ?? 0,
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
        displayTitle: nodeTitle(node),
        customTitle: node.title,
        secondary: resolveFileInfo?.(node) ?? nodeSecondary(node),
        description: node.description,
        kind: node.kind,
        status: node.status,
        priority: node.priority,
        color: node.style?.color,
        align: node.align,
        missing: isMissing?.(node) ?? false,
        imageSrc: resolveImageSrc?.(node) ?? undefined,
        url: node.source.type === "url" ? node.source.url : undefined,
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
 * Comparator key lists (this and the two below) are built through
 * `satisfies Record<keyof T, true>`: adding a field to a data type fails compilation
 * until its comparator learns about it, so a new field cannot silently skip re-rendering.
 */
const NODE_DATA_KEYS = Object.keys({
  displayTitle: true,
  customTitle: true,
  secondary: true,
  description: true,
  kind: true,
  status: true,
  priority: true,
  color: true,
  align: true,
  missing: true,
  imageSrc: true,
  url: true,
} satisfies Record<keyof RoadmapNodeData, true>) as ReadonlyArray<keyof RoadmapNodeData>;

const CLUSTER_DATA_KEYS = Object.keys({
  title: true,
  color: true,
  collapsed: true,
  count: true,
} satisfies Record<keyof RoadmapClusterData, true>) as ReadonlyArray<keyof RoadmapClusterData>;

const EDGE_DATA_KEYS = Object.keys({
  direction: true,
  line: true,
  shape: true,
  color: true,
  fromSide: true,
  toSide: true,
  label: true,
} satisfies Record<keyof RoadmapEdgeData, true>) as ReadonlyArray<keyof RoadmapEdgeData>;

/** Alignment is a value object recreated on write, so it is compared by content. */
function alignEqual(a: TextAlign | undefined, b: TextAlign | undefined): boolean {
  return a?.h === b?.h && a?.v === b?.v;
}

function cardDataEqual(a: RoadmapNodeData, b: RoadmapNodeData): boolean {
  return NODE_DATA_KEYS.every((key) => (key === "align" ? alignEqual(a.align, b.align) : a[key] === b[key]));
}

function clusterDataEqual(a: RoadmapClusterData, b: RoadmapClusterData): boolean {
  return CLUSTER_DATA_KEYS.every((key) => a[key] === b[key]);
}

function flowDataEqual(a: RoadmapFlowNode, b: RoadmapFlowNode): boolean {
  if (isCardNode(a) && isCardNode(b)) {
    return cardDataEqual(a.data, b.data);
  }

  if (!isCardNode(a) && !isCardNode(b)) {
    return clusterDataEqual(a.data, b.data);
  }

  return false;
}

/**
 * Merges freshly derived flow nodes into the current list, preserving object identity for nodes
 * that did not change. React Flow re-renders per element by reference, so on a large board an
 * unrelated mutation leaves untouched cards alone instead of re-rendering all of them.
 */
export function reconcileFlowNodes(current: RoadmapFlowNode[], next: RoadmapFlowNode[]): RoadmapFlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));

  return next.map((node) => {
    const existing = currentById.get(node.id);

    if (existing === undefined || existing.type !== node.type) {
      return node;
    }

    const dataEqual = flowDataEqual(existing, node);

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

export function stateToFlowEdges(state: RoadmapState): RoadmapFlowEdge[] {
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
      shape: edge.style?.shape,
      color: edge.style?.color,
      fromSide: edge.fromSide,
      toSide: edge.toSide,
      label: edge.label,
    },
  }));
}

function edgeDataEqual(a: RoadmapEdgeData | undefined, b: RoadmapEdgeData | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }

  return EDGE_DATA_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Same identity-preserving merge as `reconcileFlowNodes`, for edges. The ephemeral
 * `selected` flag carries over to changed edges, so an unrelated commit does not drop
 * the current edge selection.
 */
export function reconcileFlowEdges(current: RoadmapFlowEdge[], next: RoadmapFlowEdge[]): RoadmapFlowEdge[] {
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
