import { CLUSTER_PADDING } from "../constants";
import { arrangeClusterGrid } from "../domain/clusterLayout";
import { asSide, createCluster, createEdge } from "../domain/create";
import { sourceFile } from "../domain/source";
import type {
  EdgeDirection,
  EdgeLine,
  EdgeSide,
  RoadmapEdge,
  RoadmapEndpoint,
  RoadmapNode,
  RoadmapNodeSource,
  RoadmapPriority,
  RoadmapState,
  RoadmapStatus,
  RoadmapViewport,
  TextAlign,
  TextAlignH,
  TextAlignV,
} from "../domain/types";
import { isReservedHeading } from "../markdown/cluster";
import { sanitizeAlias, sanitizeInline } from "../markdown/sanitize";
import {
  dissolveClusterSection,
  insertNodeBlock,
  moveNodeToCluster,
  removeClusterHeading,
  removeNodeBlock,
  replaceClusterHeading,
  updateNodeBlock,
  writeClusterSection,
  writeRelations,
  writeState,
} from "./document";

export interface NodeMetaPatch {
  status?: RoadmapStatus | null;
  priority?: RoadmapPriority | null;
  color?: string | null;
  title?: string | null;
  description?: string | null;
}

interface Snapshot {
  state: RoadmapState;
  content: string;
}

const HISTORY_LIMIT = 200;

/**
 * In-memory roadmap state plus its serialized file content. Mutations produce new
 * immutable state snapshots and keep the content in sync so the view can persist the
 * latest text. Layout-only changes touch just the hidden state block; structural
 * changes also update the readable Markdown body (node markers and `## Relations`).
 *
 * Each mutation records the prior snapshot so `undo`/`redo` can step through the edit
 * history. Snapshots are cheap to keep because state and content are replaced wholesale
 * rather than mutated in place.
 */
export class RoadmapSession {
  private stateValue: RoadmapState;
  private contentValue: string;
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];

  constructor(state: RoadmapState, content: string) {
    this.stateValue = state;
    this.contentValue = content;
  }

  get state(): RoadmapState {
    return this.stateValue;
  }

  get content(): string {
    return this.contentValue;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private begin(): void {
    this.undoStack.push({ state: this.stateValue, content: this.contentValue });

    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }

    this.redoStack.length = 0;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();

    if (prev === undefined) {
      return false;
    }

    this.redoStack.push({ state: this.stateValue, content: this.contentValue });
    this.stateValue = prev.state;
    this.contentValue = prev.content;

    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();

    if (next === undefined) {
      return false;
    }

    this.undoStack.push({ state: this.stateValue, content: this.contentValue });
    this.stateValue = next.state;
    this.contentValue = next.content;

    return true;
  }

  addNode(node: RoadmapNode): void {
    this.begin();
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [node.id]: node },
    };
    this.contentValue = writeState(insertNodeBlock(this.contentValue, node), this.stateValue);
  }

  addNodes(nodes: readonly RoadmapNode[]): void {
    if (nodes.length === 0) {
      return;
    }

    this.begin();
    let content = this.contentValue;
    const next = { ...this.stateValue.nodes };

    for (const node of nodes) {
      next[node.id] = node;
      content = insertNodeBlock(content, node);
    }

    this.stateValue = { ...this.stateValue, nodes: next };
    this.contentValue = writeState(content, this.stateValue);
  }

  /**
   * Wraps the given top-level nodes into a new cluster sized to their bounding box. Member
   * layouts are rebased to be relative to the cluster origin; the body moves their blocks
   * under the cluster heading so membership stays canonical there.
   */
  createClusterFromNodes(nodeIds: readonly string[], title: string): void {
    const safeTitle = sanitizeAlias(title);

    if (safeTitle.length === 0 || isReservedHeading(safeTitle)) {
      return;
    }

    const members: RoadmapNode[] = [];

    for (const id of nodeIds) {
      const node = this.stateValue.nodes[id];

      if (node !== undefined && node.clusterId == null) {
        members.push(node);
      }
    }

    if (members.length === 0) {
      return;
    }

    this.begin();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of members) {
      minX = Math.min(minX, node.layout.x);
      minY = Math.min(minY, node.layout.y);
      maxX = Math.max(maxX, node.layout.x + node.layout.width);
      maxY = Math.max(maxY, node.layout.y + node.layout.height);
    }

    const layout = {
      x: minX - CLUSTER_PADDING,
      y: minY - CLUSTER_PADDING,
      width: maxX - minX + CLUSTER_PADDING * 2,
      height: maxY - minY + CLUSTER_PADDING * 2,
    };
    const cluster = createCluster(safeTitle, layout);
    const nodes = { ...this.stateValue.nodes };

    for (const node of members) {
      nodes[node.id] = {
        ...node,
        clusterId: cluster.id,
        layout: { ...node.layout, x: node.layout.x - layout.x, y: node.layout.y - layout.y },
      };
    }

    const clusters = { ...this.stateValue.clusters, [cluster.id]: cluster };
    const edges = withoutInternalEdges(this.stateValue.edges, nodes);
    const edgesChanged = edges !== this.stateValue.edges;

    this.stateValue = { ...this.stateValue, clusters, nodes, edges };
    let content = writeClusterSection(
      this.contentValue,
      cluster,
      members.map((node) => node.id),
    );

    content = writeState(content, this.stateValue);
    this.contentValue = edgesChanged ? writeRelations(content, this.stateValue) : content;
  }

  addNodeWithEdge(node: RoadmapNode, fromNodeId: string, fromHandle?: string | null, toHandle?: string | null): void {
    this.begin();
    const nodes = { ...this.stateValue.nodes, [node.id]: node };
    const content = insertNodeBlock(this.contentValue, node);
    const edge = createEdge(
      this.endpointFor(fromNodeId),
      { type: "node", id: node.id },
      asSide(fromHandle),
      asSide(toHandle),
    );
    const edges = { ...this.stateValue.edges, [edge.id]: edge };

    this.stateValue = { ...this.stateValue, nodes, edges };
    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
  }

  moveNode(id: string, x: number, y: number): void {
    this.moveNodes([{ id, x, y }]);
  }

  moveNodes(moves: ReadonlyArray<{ id: string; x: number; y: number }>): void {
    const nodes = { ...this.stateValue.nodes };
    let changed = false;

    for (const { id, x, y } of moves) {
      const node = nodes[id];

      if (node === undefined) {
        continue;
      }

      nodes[id] = { ...node, layout: { ...node.layout, x, y } };
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.begin();
    this.stateValue = { ...this.stateValue, nodes };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  /**
   * Reassigns nodes to a cluster (or to the root, `clusterId === null`) by their absolute drop
   * position, rebasing layout to/from cluster-relative coordinates and moving the body block
   * under/out of the cluster heading. Used for spatial drag in/out of a cluster.
   */
  setNodesCluster(items: ReadonlyArray<{ id: string; clusterId: string | null; x: number; y: number }>): void {
    const changes = items.filter((item) => {
      const node = this.stateValue.nodes[item.id];

      return node !== undefined && (node.clusterId ?? null) !== item.clusterId;
    });

    if (changes.length === 0) {
      return;
    }

    this.begin();
    const nodes = { ...this.stateValue.nodes };
    let content = this.contentValue;

    for (const { id, clusterId, x, y } of changes) {
      const node = nodes[id];
      const cluster = clusterId === null ? undefined : this.stateValue.clusters[clusterId];
      const next: RoadmapNode = {
        ...node,
        layout: {
          ...node.layout,
          x: cluster === undefined ? x : x - cluster.layout.x,
          y: cluster === undefined ? y : y - cluster.layout.y,
        },
      };

      if (clusterId === null) {
        delete next.clusterId;
      } else {
        next.clusterId = clusterId;
      }

      nodes[id] = next;
      content = moveNodeToCluster(content, id, clusterId);
    }

    const edges = withoutInternalEdges(this.stateValue.edges, nodes);
    const edgesChanged = edges !== this.stateValue.edges;

    this.stateValue = { ...this.stateValue, nodes, edges };
    content = writeState(content, this.stateValue);
    this.contentValue = edgesChanged ? writeRelations(content, this.stateValue) : content;
  }

  resizeNode(id: string, width: number, height: number, x: number, y: number): void {
    const node = this.stateValue.nodes[id];

    if (node === undefined) {
      return;
    }

    this.begin();
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [id]: { ...node, layout: { x, y, width, height } } },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  moveClusters(moves: ReadonlyArray<{ id: string; x: number; y: number }>): void {
    const clusters = { ...this.stateValue.clusters };
    let changed = false;

    for (const { id, x, y } of moves) {
      const cluster = clusters[id];

      if (cluster === undefined) {
        continue;
      }

      clusters[id] = { ...cluster, layout: { ...cluster.layout, x, y } };
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.begin();
    this.stateValue = { ...this.stateValue, clusters };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  resizeCluster(id: string, width: number, height: number, x: number, y: number): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    this.begin();
    this.stateValue = {
      ...this.stateValue,
      clusters: {
        ...this.stateValue.clusters,
        [id]: { ...cluster, layout: { x, y, width, height } },
      },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  toggleClusterCollapsed(id: string): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    this.begin();
    const next = { ...cluster };

    if (cluster.collapsed === true) {
      delete next.collapsed;
    } else {
      next.collapsed = true;
    }

    this.stateValue = {
      ...this.stateValue,
      clusters: { ...this.stateValue.clusters, [id]: next },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  /** Lays out the cluster's member nodes in a tidy grid (reading order), resizing the cluster
   * exactly to fit. Layout-only; membership and the body are unchanged. */
  arrangeCluster(id: string): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    const members = Object.values(this.stateValue.nodes).filter((node) => node.clusterId === id);
    const arrangement = arrangeClusterGrid(members, cluster.layout.width);

    if (arrangement === null) {
      return;
    }

    this.begin();
    const nodes = { ...this.stateValue.nodes };

    for (const [nodeId, position] of arrangement.positions) {
      const node = nodes[nodeId];

      nodes[nodeId] = { ...node, layout: { ...node.layout, x: position.x, y: position.y } };
    }

    this.stateValue = {
      ...this.stateValue,
      nodes,
      clusters: {
        ...this.stateValue.clusters,
        [id]: { ...cluster, layout: { ...cluster.layout, width: arrangement.width, height: arrangement.height } },
      },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  renameCluster(id: string, title: string): void {
    const cluster = this.stateValue.clusters[id];
    const safeTitle = sanitizeAlias(title);

    if (
      cluster === undefined ||
      safeTitle.length === 0 ||
      safeTitle === cluster.title ||
      isReservedHeading(safeTitle)
    ) {
      return;
    }

    this.begin();
    const next = { ...cluster, title: safeTitle };

    this.stateValue = {
      ...this.stateValue,
      clusters: { ...this.stateValue.clusters, [id]: next },
    };
    const content = replaceClusterHeading(this.contentValue, next);

    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
  }

  setClusterColor(id: string, color: string | null): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined || (cluster.style?.color ?? null) === (color === "" ? null : color)) {
      return;
    }

    this.begin();
    const style = { ...cluster.style };

    if (color === null || color.length === 0) {
      delete style.color;
    } else {
      style.color = color;
    }

    const next = { ...cluster, style: Object.keys(style).length > 0 ? style : undefined };

    this.stateValue = {
      ...this.stateValue,
      clusters: { ...this.stateValue.clusters, [id]: next },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  private memberNodeIds(clusterId: string): string[] {
    return Object.values(this.stateValue.nodes)
      .filter((node) => node.clusterId === clusterId)
      .map((node) => node.id);
  }

  private edgesWithoutEndpoints(dropped: ReadonlySet<string>): Record<string, RoadmapEdge> {
    const edges: Record<string, RoadmapEdge> = {};

    for (const [id, edge] of Object.entries(this.stateValue.edges)) {
      if (!dropped.has(edge.from.id) && !dropped.has(edge.to.id)) {
        edges[id] = edge;
      }
    }

    return edges;
  }

  /** Deletes the cluster but keeps its nodes, rebasing their layouts to absolute and moving
   * their body blocks out to the unclustered region ([[ADR-0011]] delete option 1). */
  dissolveCluster(id: string): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    this.begin();
    const memberIds = this.memberNodeIds(id);
    const nodes = { ...this.stateValue.nodes };

    for (const memberId of memberIds) {
      const node = nodes[memberId];
      const next: RoadmapNode = {
        ...node,
        layout: {
          ...node.layout,
          x: node.layout.x + cluster.layout.x,
          y: node.layout.y + cluster.layout.y,
        },
      };

      delete next.clusterId;
      nodes[memberId] = next;
    }

    const clusters = { ...this.stateValue.clusters };

    delete clusters[id];
    this.stateValue = {
      ...this.stateValue,
      nodes,
      clusters,
      edges: this.edgesWithoutEndpoints(new Set([id])),
    };
    const content = dissolveClusterSection(this.contentValue, id, memberIds);

    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
  }

  /** Deletes the cluster and removes its member nodes from the roadmap. Source files are not
   * touched ([[ADR-0011]] delete option 2). */
  deleteClusterAndNodes(id: string): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    this.begin();
    const memberIds = this.memberNodeIds(id);
    const nodes = { ...this.stateValue.nodes };
    let content = this.contentValue;

    for (const memberId of memberIds) {
      delete nodes[memberId];
      content = removeNodeBlock(content, memberId);
    }

    content = removeClusterHeading(content, id);
    const clusters = { ...this.stateValue.clusters };

    delete clusters[id];
    this.stateValue = {
      ...this.stateValue,
      nodes,
      clusters,
      edges: this.edgesWithoutEndpoints(new Set([id, ...memberIds])),
    };
    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
  }

  setNodeAlign(id: string, patch: { h?: TextAlignH; v?: TextAlignV }): void {
    const node = this.stateValue.nodes[id];

    if (node === undefined) {
      return;
    }

    const current = node.align ?? { h: "left", v: "middle" };
    const align: TextAlign = { h: patch.h ?? current.h, v: patch.v ?? current.v };

    if (align.h === current.h && align.v === current.v && node.align !== undefined) {
      return;
    }

    this.begin();
    this.stateValue = {
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [id]: { ...node, align } },
    };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  updateNodeMeta(id: string, patch: NodeMetaPatch): void {
    const node = this.stateValue.nodes[id];

    if (node === undefined) {
      return;
    }

    const next: RoadmapNode = { ...node };

    if ("status" in patch) {
      if (patch.status == null) delete next.status;
      else next.status = patch.status;
    }

    if ("priority" in patch) {
      if (patch.priority == null) delete next.priority;
      else next.priority = patch.priority;
    }

    if ("title" in patch) {
      const title = patch.title == null ? "" : sanitizeInline(patch.title);

      if (title.length === 0) delete next.title;
      else next.title = title;
    }

    if ("description" in patch) {
      const description = patch.description == null ? "" : sanitizeInline(patch.description);

      if (description.length === 0) delete next.description;
      else next.description = description;
    }

    if ("color" in patch) {
      const style = { ...next.style };

      if (patch.color == null || patch.color.length === 0) delete style.color;
      else style.color = patch.color;
      next.style = Object.keys(style).length > 0 ? style : undefined;
    }

    if (
      next.status === node.status &&
      next.priority === node.priority &&
      next.title === node.title &&
      next.description === node.description &&
      next.style?.color === node.style?.color
    ) {
      return;
    }

    this.begin();
    this.stateValue = { ...this.stateValue, nodes: { ...this.stateValue.nodes, [id]: next } };
    const touchesBody = "status" in patch || "priority" in patch || "title" in patch || "description" in patch;
    let content = touchesBody ? updateNodeBlock(this.contentValue, next) : this.contentValue;

    content = writeState(content, this.stateValue);

    if ("title" in patch) {
      content = writeRelations(content, this.stateValue);
    }

    this.contentValue = content;
  }

  setNodeUrl(id: string, url: string): void {
    const node = this.stateValue.nodes[id];

    if (node === undefined || node.source.type !== "url") {
      return;
    }

    this.begin();
    const next: RoadmapNode = { ...node, source: { type: "url", url } };

    this.stateValue = { ...this.stateValue, nodes: { ...this.stateValue.nodes, [id]: next } };
    const content = writeState(updateNodeBlock(this.contentValue, next), this.stateValue);

    this.contentValue = writeRelations(content, this.stateValue);
  }

  deleteNode(id: string): void {
    this.deleteNodes([id]);
  }

  deleteNodes(ids: readonly string[]): void {
    const present = ids.filter((id) => this.stateValue.nodes[id] !== undefined);

    if (present.length === 0) {
      return;
    }

    this.begin();
    let content = this.contentValue;
    const nodes = { ...this.stateValue.nodes };

    for (const id of present) {
      delete nodes[id];
      content = removeNodeBlock(content, id);
    }

    const removed = new Set(present);
    const edges: Record<string, RoadmapEdge> = {};

    for (const [edgeId, edge] of Object.entries(this.stateValue.edges)) {
      if (!removed.has(endpointNodeId(edge.from)) && !removed.has(endpointNodeId(edge.to))) {
        edges[edgeId] = edge;
      }
    }

    this.stateValue = { ...this.stateValue, nodes, edges };
    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
  }

  addEdge(fromNodeId: string, toNodeId: string, fromHandle?: string | null, toHandle?: string | null): void {
    const from = this.endpointFor(fromNodeId);
    const to = this.endpointFor(toNodeId);

    if (this.isInternalConnection(from, to)) {
      return;
    }

    const duplicate = Object.values(this.stateValue.edges).some(
      (edge) =>
        edge.from.type === from.type && edge.from.id === from.id && edge.to.type === to.type && edge.to.id === to.id,
    );

    if (duplicate) {
      return;
    }

    this.begin();
    const edge = createEdge(from, to, asSide(fromHandle), asSide(toHandle));

    this.stateValue = {
      ...this.stateValue,
      edges: { ...this.stateValue.edges, [edge.id]: edge },
    };
    this.contentValue = writeRelations(writeState(this.contentValue, this.stateValue), this.stateValue);
  }

  private endpointFor(id: string): RoadmapEndpoint {
    return this.stateValue.clusters[id] !== undefined ? { type: "cluster", id } : { type: "node", id };
  }

  /** Forbids direct connections inside one cluster: node↔node sharing a cluster, or a node
   * linking to its own container ([[ADR-0005]] / [[ADR-0006]]). Cross-cluster links are allowed. */
  private isInternalConnection(from: RoadmapEndpoint, to: RoadmapEndpoint): boolean {
    const clusterOfNode = (id: string): string | null => this.stateValue.nodes[id]?.clusterId ?? null;

    if (from.type === "node" && to.type === "node") {
      const a = clusterOfNode(from.id);

      return a !== null && a === clusterOfNode(to.id);
    }

    if (from.type === "node" && to.type === "cluster") {
      return clusterOfNode(from.id) === to.id;
    }

    if (from.type === "cluster" && to.type === "node") {
      return clusterOfNode(to.id) === from.id;
    }

    return false;
  }

  deleteEdge(id: string): void {
    this.deleteEdges([id]);
  }

  deleteEdges(ids: readonly string[]): void {
    const present = ids.filter((id) => this.stateValue.edges[id] !== undefined);

    if (present.length === 0) {
      return;
    }

    this.begin();
    const edges = { ...this.stateValue.edges };

    for (const id of present) {
      delete edges[id];
    }

    this.stateValue = { ...this.stateValue, edges };
    this.contentValue = writeRelations(writeState(this.contentValue, this.stateValue), this.stateValue);
  }

  deleteElements(nodeIds: readonly string[], edgeIds: readonly string[]): void {
    const removed = new Set(nodeIds.filter((id) => this.stateValue.nodes[id] !== undefined));
    const droppedEdges = new Set(edgeIds.filter((id) => this.stateValue.edges[id] !== undefined));

    for (const [edgeId, edge] of Object.entries(this.stateValue.edges)) {
      if (removed.has(endpointNodeId(edge.from)) || removed.has(endpointNodeId(edge.to))) {
        droppedEdges.add(edgeId);
      }
    }

    if (removed.size === 0 && droppedEdges.size === 0) {
      return;
    }

    this.begin();
    let content = this.contentValue;
    const nodes = { ...this.stateValue.nodes };

    for (const id of removed) {
      delete nodes[id];
      content = removeNodeBlock(content, id);
    }

    const edges = { ...this.stateValue.edges };

    for (const id of droppedEdges) {
      delete edges[id];
    }

    this.stateValue = { ...this.stateValue, nodes, edges };
    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);
  }

  updateEdge(id: string, patch: { direction?: EdgeDirection; line?: EdgeLine | "solid"; label?: string }): void {
    const edge = this.stateValue.edges[id];

    if (edge === undefined) {
      return;
    }

    const next: RoadmapEdge = { ...edge };

    if (patch.direction !== undefined) {
      next.direction = patch.direction;
    }

    if (patch.label !== undefined) {
      const label = sanitizeInline(patch.label);

      if (label.length === 0) {
        delete next.label;
      } else {
        next.label = label;
      }
    }

    if (patch.line !== undefined) {
      const style = { ...edge.style };

      if (patch.line === "solid") {
        delete style.line;
      } else {
        style.line = patch.line;
      }

      next.style = Object.keys(style).length > 0 ? style : undefined;
    }

    if (next.direction === edge.direction && next.label === edge.label && next.style?.line === edge.style?.line) {
      return;
    }

    this.begin();
    this.stateValue = { ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } };
    this.contentValue = writeRelations(writeState(this.contentValue, this.stateValue), this.stateValue);
  }

  reverseEdge(id: string): void {
    const edge = this.stateValue.edges[id];

    if (edge === undefined) {
      return;
    }

    this.begin();
    const next: RoadmapEdge = { ...edge, from: edge.to, to: edge.from };

    if (edge.toSide !== undefined) {
      next.fromSide = edge.toSide;
    } else {
      delete next.fromSide;
    }

    if (edge.fromSide !== undefined) {
      next.toSide = edge.fromSide;
    } else {
      delete next.toSide;
    }

    this.stateValue = { ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } };
    this.contentValue = writeRelations(writeState(this.contentValue, this.stateValue), this.stateValue);
  }

  setEdgeEndpointSide(id: string, end: "from" | "to", side: EdgeSide | undefined): void {
    const edge = this.stateValue.edges[id];

    if (edge === undefined) {
      return;
    }

    this.begin();
    const next: RoadmapEdge = { ...edge };

    if (end === "from") {
      if (side === undefined) {
        delete next.fromSide;
      } else {
        next.fromSide = side;
      }
    } else {
      if (side === undefined) {
        delete next.toSide;
      } else {
        next.toSide = side;
      }
    }

    this.stateValue = { ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  /**
   * Persists the camera position. Deliberately outside the undo history: pan/zoom is not
   * an edit, and an undo step per camera move would bury real changes.
   */
  setViewport(viewport: RoadmapViewport): void {
    const current = this.stateValue.viewport;

    if (
      current !== undefined &&
      current.x === viewport.x &&
      current.y === viewport.y &&
      current.zoom === viewport.zoom
    ) {
      return;
    }

    this.stateValue = { ...this.stateValue, viewport };
    this.contentValue = writeState(this.contentValue, this.stateValue);
  }

  /**
   * Re-points file-backed node sources after a vault rename (file or folder prefix),
   * updating body blocks and relations. Outside the undo history: the vault rename is
   * an external fact, not a roadmap edit. Returns whether anything was re-pointed.
   */
  applySourceRename(oldPath: string, newPath: string): boolean {
    const prefix = `${oldPath}/`;
    const nodes = { ...this.stateValue.nodes };
    let content = this.contentValue;
    let touched = false;

    for (const [id, node] of Object.entries(this.stateValue.nodes)) {
      const file = sourceFile(node.source);

      if (file === null) {
        continue;
      }

      let nextFile: string | null = null;

      if (file === oldPath) {
        nextFile = newPath;
      } else if (file.startsWith(prefix)) {
        nextFile = `${newPath}/${file.slice(prefix.length)}`;
      }

      if (nextFile === null) {
        continue;
      }

      const next: RoadmapNode = { ...node, source: { ...node.source, file: nextFile } as RoadmapNodeSource };

      nodes[id] = next;
      content = updateNodeBlock(content, next);
      touched = true;
    }

    if (!touched) {
      return false;
    }

    this.stateValue = { ...this.stateValue, nodes };
    this.contentValue = writeRelations(writeState(content, this.stateValue), this.stateValue);

    return true;
  }

  /**
   * Re-points one or both ends of an edge to the given connection, keeping direction, label and
   * style. Both endpoints are rebuilt from the connection, so the untouched end stays as it was;
   * a null handle means that end floats. No-ops on a self-loop, a forbidden intra-cluster link,
   * or a connection that duplicates another edge.
   */
  reconnectEdge(id: string, connection: RoadmapConnection): void {
    const edge = this.stateValue.edges[id];

    if (edge === undefined || connection.source === connection.target) {
      return;
    }

    const from = this.endpointFor(connection.source);
    const to = this.endpointFor(connection.target);

    if (this.isInternalConnection(from, to)) {
      return;
    }

    const duplicate = Object.values(this.stateValue.edges).some(
      (other) =>
        other.id !== id &&
        other.from.type === from.type &&
        other.from.id === from.id &&
        other.to.type === to.type &&
        other.to.id === to.id,
    );

    if (duplicate) {
      return;
    }

    const fromSide = asSide(connection.sourceHandle);
    const toSide = asSide(connection.targetHandle);
    const next: RoadmapEdge = { ...edge, from, to };

    if (fromSide === undefined) {
      delete next.fromSide;
    } else {
      next.fromSide = fromSide;
    }

    if (toSide === undefined) {
      delete next.toSide;
    } else {
      next.toSide = toSide;
    }

    this.begin();
    this.stateValue = { ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } };
    this.contentValue = writeRelations(writeState(this.contentValue, this.stateValue), this.stateValue);
  }
}

export interface RoadmapConnection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

function endpointNodeId(endpoint: RoadmapEdge["from"]): string {
  return endpoint.type === "node" ? endpoint.id : "";
}

/**
 * Drops edges that became internal to a cluster after membership changed: node↔node
 * sharing a cluster or a node linked to its own container. Returns the original map
 * when nothing changed, so callers can detect whether Relations need a rewrite.
 */
function withoutInternalEdges(
  edges: Record<string, RoadmapEdge>,
  nodes: Record<string, RoadmapNode>,
): Record<string, RoadmapEdge> {
  const clusterOf = (endpoint: RoadmapEndpoint): string | null =>
    endpoint.type === "node" ? (nodes[endpoint.id]?.clusterId ?? null) : endpoint.id;
  const isInternal = (edge: RoadmapEdge): boolean => {
    if (edge.from.type === "cluster" && edge.to.type === "cluster") {
      return false;
    }

    const a = clusterOf(edge.from);
    const b = clusterOf(edge.to);

    return a !== null && a === b;
  };
  const kept: Record<string, RoadmapEdge> = {};
  let changed = false;

  for (const [id, edge] of Object.entries(edges)) {
    if (isInternal(edge)) {
      changed = true;
    } else {
      kept[id] = edge;
    }
  }

  return changed ? kept : edges;
}
