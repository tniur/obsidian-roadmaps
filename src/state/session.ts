import { CLUSTER_CONTENT_INSET_TOP, CLUSTER_PADDING, CLUSTER_PADDING_Y } from "../constants";
import { computeAutoLayout } from "../domain/autoLayout";
import { arrangeClusterGrid, membersBoundingBox } from "../domain/clusterLayout";
import { asSide, createCluster, createEdge } from "../domain/create";
import { sourceFile } from "../domain/source";
import { uniqueClusterTitle } from "../domain/title";
import {
  DEFAULT_TEXT_ALIGN,
  type EdgeDirection,
  type EdgeLine,
  type EdgeShape,
  type EdgeSide,
  type RoadmapCluster,
  type RoadmapEdge,
  type RoadmapEndpoint,
  type RoadmapNode,
  type RoadmapNodeSource,
  type RoadmapPriority,
  type RoadmapState,
  type RoadmapStatus,
  type RoadmapViewport,
  type TextAlign,
  type TextAlignH,
  type TextAlignV,
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

export interface EdgeUpdatePatch {
  direction?: EdgeDirection;
  line?: EdgeLine | "solid";
  shape?: EdgeShape | "curved";
  label?: string;
  color?: string | null;
}

interface Snapshot {
  state: RoadmapState;
  content: string;
}

/**
 * Side-effects of a mutation beyond the hidden state block. `body` transforms the
 * readable Markdown (node blocks, cluster headings); `relations` rewrites the
 * `## Relations` section; `history: false` skips the undo snapshot for changes that are
 * not edits (camera moves, external vault renames).
 */
interface CommitOptions {
  body?: (content: string) => string;
  relations?: boolean;
  history?: boolean;
}

const HISTORY_LIMIT = 200;

/**
 * In-memory roadmap state plus its serialized file content. Mutations produce new
 * immutable state snapshots and keep the content in sync so the view can persist the
 * latest text. Layout-only changes touch just the hidden state block; structural
 * changes also update the readable Markdown body (node markers and `## Relations`).
 * Every mutation funnels through `commit`, which owns that persist policy, and records
 * the prior snapshot so `undo`/`redo` can step through the edit history.
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

  /** Single seam every mutation persists through; `CommitOptions` documents the policy. */
  private commit(next: RoadmapState, opts: CommitOptions = {}): void {
    if (opts.history !== false) {
      this.begin();
    }

    this.stateValue = next;
    const body = opts.body === undefined ? this.contentValue : opts.body(this.contentValue);
    const content = writeState(body, next);

    this.contentValue = opts.relations === true ? writeRelations(content, next) : content;
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
    this.commit(
      { ...this.stateValue, nodes: { ...this.stateValue.nodes, [node.id]: node } },
      { body: (content) => insertNodeBlock(content, node) },
    );
  }

  /**
   * Edges and clusters (paste/duplicate flows pass copies wired between the new nodes)
   * land in the same commit, so one undo removes the whole batch. Cluster titles get a
   * numeric suffix when taken; member nodes must reference the passed clusters and carry
   * cluster-relative layouts — their body blocks move under the new heading.
   */
  addNodes(
    nodes: readonly RoadmapNode[],
    edges: readonly RoadmapEdge[] = [],
    clusters: readonly RoadmapCluster[] = [],
  ): void {
    if (nodes.length === 0 && clusters.length === 0) {
      return;
    }

    const nextClusters = { ...this.stateValue.clusters };

    for (const cluster of clusters) {
      nextClusters[cluster.id] = { ...cluster, title: uniqueClusterTitle(cluster.title, nextClusters) };
    }

    const nextNodes = { ...this.stateValue.nodes };

    for (const node of nodes) {
      nextNodes[node.id] = node;
    }

    const nextEdges = { ...this.stateValue.edges };

    for (const edge of edges) {
      nextEdges[edge.id] = edge;
    }

    this.commit(
      { ...this.stateValue, nodes: nextNodes, edges: nextEdges, clusters: nextClusters },
      {
        body: (content) => {
          let next = nodes.reduce((acc, node) => insertNodeBlock(acc, node), content);

          for (const cluster of clusters) {
            next = writeClusterSection(
              next,
              nextClusters[cluster.id],
              nodes.filter((node) => node.clusterId === cluster.id).map((node) => node.id),
            );
          }

          return next;
        },
        relations: edges.length > 0,
      },
    );
  }

  /**
   * Wraps the given top-level nodes into a new cluster sized to their bounding box. Member
   * layouts are rebased to be relative to the cluster origin; the body moves their blocks
   * under the cluster heading so membership stays canonical there. Returns the final
   * cluster title — a taken one gets a numeric suffix — or null when nothing was created.
   */
  createClusterFromNodes(nodeIds: readonly string[], title: string): string | null {
    const safeTitle = sanitizeAlias(title);

    if (safeTitle.length === 0 || isReservedHeading(safeTitle)) {
      return null;
    }

    const members: RoadmapNode[] = [];

    for (const id of nodeIds) {
      const node = this.stateValue.nodes[id];

      if (node !== undefined && node.clusterId == null) {
        members.push(node);
      }
    }

    const box = membersBoundingBox(members);

    if (box === null) {
      return null;
    }

    const layout = {
      x: box.x - CLUSTER_PADDING,
      y: box.y - CLUSTER_CONTENT_INSET_TOP,
      width: box.width + CLUSTER_PADDING * 2,
      height: box.height + CLUSTER_CONTENT_INSET_TOP + CLUSTER_PADDING_Y,
    };
    const cluster = createCluster(uniqueClusterTitle(safeTitle, this.stateValue.clusters), layout);
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

    this.commit(
      { ...this.stateValue, clusters, nodes, edges },
      {
        body: (content) =>
          writeClusterSection(
            content,
            cluster,
            members.map((node) => node.id),
          ),
        relations: edges !== this.stateValue.edges,
      },
    );

    return cluster.title;
  }

  addNodeWithEdge(node: RoadmapNode, fromNodeId: string, fromHandle?: string | null, toHandle?: string | null): void {
    const nodes = { ...this.stateValue.nodes, [node.id]: node };
    const edge = createEdge(
      this.endpointFor(fromNodeId),
      { type: "node", id: node.id },
      asSide(fromHandle),
      asSide(toHandle),
    );
    const edges = { ...this.stateValue.edges, [edge.id]: edge };

    this.commit(
      { ...this.stateValue, nodes, edges },
      { body: (content) => insertNodeBlock(content, node), relations: true },
    );
  }

  moveNode(id: string, x: number, y: number): void {
    this.moveNodes([{ id, x, y }]);
  }

  moveNodes(moves: ReadonlyArray<{ id: string; x: number; y: number }>): void {
    const nodes = { ...this.stateValue.nodes };
    let changed = false;

    for (const { id, x, y } of moves) {
      const node = nodes[id];

      if (node === undefined || (node.layout.x === x && node.layout.y === y)) {
        continue;
      }

      nodes[id] = { ...node, layout: { ...node.layout, x, y } };
      changed = true;
    }

    if (changed) {
      this.commit({ ...this.stateValue, nodes });
    }
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

    const nodes = { ...this.stateValue.nodes };

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

      setOptional(next, "clusterId", clusterId ?? undefined);
      nodes[id] = next;
    }

    const edges = withoutInternalEdges(this.stateValue.edges, nodes);

    this.commit(
      { ...this.stateValue, nodes, edges },
      {
        body: (content) => changes.reduce((acc, { id, clusterId }) => moveNodeToCluster(acc, id, clusterId), content),
        relations: edges !== this.stateValue.edges,
      },
    );
  }

  resizeNode(id: string, width: number, height: number, x: number, y: number): void {
    const node = this.stateValue.nodes[id];

    if (node === undefined) {
      return;
    }

    this.commit({
      ...this.stateValue,
      nodes: { ...this.stateValue.nodes, [id]: { ...node, layout: { x, y, width, height } } },
    });
  }

  moveClusters(moves: ReadonlyArray<{ id: string; x: number; y: number }>): void {
    const clusters = { ...this.stateValue.clusters };
    let changed = false;

    for (const { id, x, y } of moves) {
      const cluster = clusters[id];

      if (cluster === undefined || (cluster.layout.x === x && cluster.layout.y === y)) {
        continue;
      }

      clusters[id] = { ...cluster, layout: { ...cluster.layout, x, y } };
      changed = true;
    }

    if (changed) {
      this.commit({ ...this.stateValue, clusters });
    }
  }

  /** Tidies the whole board with a left-to-right layered layout; layout only, one history step. */
  autoLayout(): void {
    const layout = computeAutoLayout(this.stateValue);
    const nodes = { ...this.stateValue.nodes };
    const clusters = { ...this.stateValue.clusters };
    let changed = false;

    for (const [id, position] of Object.entries(layout.nodePositions)) {
      const node = nodes[id];

      if (node !== undefined && (node.layout.x !== position.x || node.layout.y !== position.y)) {
        nodes[id] = { ...node, layout: { ...node.layout, x: position.x, y: position.y } };
        changed = true;
      }
    }

    for (const [id, box] of Object.entries(layout.clusters)) {
      const cluster = clusters[id];
      const current = cluster?.layout;

      if (
        cluster !== undefined &&
        current !== undefined &&
        (current.x !== box.x || current.y !== box.y || current.width !== box.width || current.height !== box.height)
      ) {
        clusters[id] = { ...cluster, layout: { x: box.x, y: box.y, width: box.width, height: box.height } };
        changed = true;
      }
    }

    if (changed) {
      this.commit({ ...this.stateValue, nodes, clusters });
    }
  }

  resizeCluster(id: string, width: number, height: number, x: number, y: number): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    this.commit({
      ...this.stateValue,
      clusters: { ...this.stateValue.clusters, [id]: { ...cluster, layout: { x, y, width, height } } },
    });
  }

  toggleClusterCollapsed(id: string): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    const next = { ...cluster };

    setOptional(next, "collapsed", cluster.collapsed === true ? undefined : true);
    this.commit({ ...this.stateValue, clusters: { ...this.stateValue.clusters, [id]: next } });
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

    const nodes = { ...this.stateValue.nodes };

    for (const [nodeId, position] of arrangement.positions) {
      const node = nodes[nodeId];

      nodes[nodeId] = { ...node, layout: { ...node.layout, x: position.x, y: position.y } };
    }

    this.commit({
      ...this.stateValue,
      nodes,
      clusters: {
        ...this.stateValue.clusters,
        [id]: { ...cluster, layout: { ...cluster.layout, width: arrangement.width, height: arrangement.height } },
      },
    });
  }

  /** Returns the final title — a taken one gets a numeric suffix — or null on a no-op. */
  renameCluster(id: string, title: string): string | null {
    const cluster = this.stateValue.clusters[id];
    const safeTitle = sanitizeAlias(title);

    if (
      cluster === undefined ||
      safeTitle.length === 0 ||
      safeTitle === cluster.title ||
      isReservedHeading(safeTitle)
    ) {
      return null;
    }

    const next = { ...cluster, title: uniqueClusterTitle(safeTitle, this.stateValue.clusters, id) };

    this.commit(
      { ...this.stateValue, clusters: { ...this.stateValue.clusters, [id]: next } },
      { body: (content) => replaceClusterHeading(content, next), relations: true },
    );

    return next.title;
  }

  setClusterColor(id: string, color: string | null, options?: { history?: boolean }): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined || (cluster.style?.color ?? null) === (color === "" ? null : color)) {
      return;
    }

    const style = { ...cluster.style };

    setOptional(style, "color", color === null || color.length === 0 ? undefined : color);
    const next = { ...cluster, style: Object.keys(style).length > 0 ? style : undefined };

    this.commit(
      { ...this.stateValue, clusters: { ...this.stateValue.clusters, [id]: next } },
      { body: (content) => replaceClusterHeading(content, next), history: options?.history },
    );
  }

  private memberNodeIds(clusterId: string): string[] {
    return Object.values(this.stateValue.nodes)
      .filter((node) => node.clusterId === clusterId)
      .map((node) => node.id);
  }

  /** Deletes the cluster but keeps its nodes, rebasing their layouts to absolute and moving
   * their body blocks out to the unclustered region so they survive as top-level. */
  dissolveCluster(id: string): void {
    this.deleteSelection([], [], [id], "keep-nodes");
  }

  /** Deletes the cluster and removes its member nodes from the roadmap. Source files are not
   * touched: removing entities from the roadmap must never delete vault files. */
  deleteClusterAndNodes(id: string): void {
    this.deleteSelection([], [], [id], "with-nodes");
  }

  /**
   * Removes a mixed selection in one history step. Free nodes and explicitly selected
   * edges always go; clusters follow `clusterMode` — their nodes either survive as
   * top-level (layout rebased to absolute, body blocks moved to the unclustered region)
   * or leave the roadmap with them. Vault files are never touched. Edges losing an
   * endpoint are dropped.
   */
  deleteSelection(
    nodeIds: readonly string[],
    edgeIds: readonly string[],
    clusterIds: readonly string[],
    clusterMode: "keep-nodes" | "with-nodes",
  ): void {
    const targetClusters = clusterIds.filter((id) => this.stateValue.clusters[id] !== undefined);
    const removedNodes = new Set(nodeIds.filter((id) => this.stateValue.nodes[id] !== undefined));
    const memberIds = new Map(targetClusters.map((id) => [id, this.memberNodeIds(id)]));

    if (clusterMode === "with-nodes") {
      for (const members of memberIds.values()) {
        for (const id of members) {
          removedNodes.add(id);
        }
      }
    }

    const droppedEdges = new Set(edgeIds.filter((id) => this.stateValue.edges[id] !== undefined));
    const removedEndpoints = new Set([...removedNodes, ...targetClusters]);

    for (const [edgeId, edge] of Object.entries(this.stateValue.edges)) {
      if (removedEndpoints.has(edge.from.id) || removedEndpoints.has(edge.to.id)) {
        droppedEdges.add(edgeId);
      }
    }

    if (removedNodes.size === 0 && droppedEdges.size === 0 && targetClusters.length === 0) {
      return;
    }

    const nodes = { ...this.stateValue.nodes };

    for (const id of removedNodes) {
      delete nodes[id];
    }

    const clusters = { ...this.stateValue.clusters };

    if (clusterMode === "keep-nodes") {
      for (const [clusterId, members] of memberIds) {
        const cluster = clusters[clusterId];

        for (const memberId of members) {
          const node = nodes[memberId];

          if (node === undefined) {
            continue;
          }

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
      }
    }

    for (const id of targetClusters) {
      delete clusters[id];
    }

    const edges: Record<string, RoadmapEdge> = {};

    for (const [id, edge] of Object.entries(this.stateValue.edges)) {
      if (!droppedEdges.has(id)) {
        edges[id] = edge;
      }
    }

    this.commit(
      { ...this.stateValue, nodes, clusters, edges },
      {
        body: (content) => {
          let next = [...removedNodes].reduce(removeNodeBlock, content);

          for (const [clusterId, members] of memberIds) {
            next =
              clusterMode === "keep-nodes"
                ? dissolveClusterSection(
                    next,
                    clusterId,
                    members.filter((id) => !removedNodes.has(id)),
                  )
                : removeClusterHeading(next, clusterId);
          }

          return next;
        },
        relations: true,
      },
    );
  }

  setNodeAlign(id: string, patch: { h?: TextAlignH; v?: TextAlignV }): void {
    const node = this.stateValue.nodes[id];
    const next = node === undefined ? null : withAlignPatch(node, patch);

    if (node === undefined || next === null) {
      return;
    }

    this.commit(
      { ...this.stateValue, nodes: { ...this.stateValue.nodes, [id]: next } },
      { body: (content) => updateNodeBlock(content, next) },
    );
  }

  updateNodeMeta(id: string, patch: NodeMetaPatch): void {
    const node = this.stateValue.nodes[id];
    const next = node === undefined ? null : withNodeMetaPatch(node, patch);

    if (node === undefined || next === null) {
      return;
    }

    this.commit(
      { ...this.stateValue, nodes: { ...this.stateValue.nodes, [id]: next } },
      {
        body: (content) => updateNodeBlock(content, next),
        relations: "title" in patch,
      },
    );
  }

  /** Applies one meta patch to every node in the set as a single undo step; live
   * preview ticks (e.g. a dragged color picker) pass `history: false` after the first. */
  updateNodesMeta(ids: readonly string[], patch: NodeMetaPatch, options?: { history?: boolean }): void {
    this.commitNodesPatch(ids, (node) => withNodeMetaPatch(node, patch), options?.history);
  }

  /** Applies one alignment patch to every node in the set as a single undo step. */
  setNodesAlign(ids: readonly string[], patch: { h?: TextAlignH; v?: TextAlignV }): void {
    this.commitNodesPatch(ids, (node) => withAlignPatch(node, patch));
  }

  private commitNodesPatch(
    ids: readonly string[],
    apply: (node: RoadmapNode) => RoadmapNode | null,
    history = true,
  ): void {
    const nodes = { ...this.stateValue.nodes };
    const changed: RoadmapNode[] = [];

    for (const id of new Set(ids)) {
      const node = nodes[id];
      const next = node === undefined ? null : apply(node);

      if (next !== null && node !== undefined) {
        nodes[id] = next;
        changed.push(next);
      }
    }

    if (changed.length === 0) {
      return;
    }

    this.commit(
      { ...this.stateValue, nodes },
      { body: (content) => changed.reduce((acc, node) => updateNodeBlock(acc, node), content), history },
    );
  }

  setNodeUrl(id: string, url: string): void {
    const node = this.stateValue.nodes[id];

    if (node === undefined || node.source.type !== "url") {
      return;
    }

    const next: RoadmapNode = { ...node, source: { type: "url", url } };

    this.commit(
      { ...this.stateValue, nodes: { ...this.stateValue.nodes, [id]: next } },
      { body: (content) => updateNodeBlock(content, next), relations: true },
    );
  }

  deleteNode(id: string): void {
    this.deleteNodes([id]);
  }

  deleteNodes(ids: readonly string[]): void {
    this.deleteSelection(ids, [], [], "keep-nodes");
  }

  /**
   * Connects two elements. Drawing over an existing edge is a no-op; drawing the reverse
   * of an existing edge does not add a second line — the existing edge becomes
   * bidirectional instead, keeping its geometry.
   */
  addEdge(fromNodeId: string, toNodeId: string, fromHandle?: string | null, toHandle?: string | null): void {
    const from = this.endpointFor(fromNodeId);
    const to = this.endpointFor(toNodeId);

    if (this.isInternalConnection(from, to)) {
      return;
    }

    const edges = Object.values(this.stateValue.edges);

    if (edges.some((edge) => endpointsEqual(edge.from, from) && endpointsEqual(edge.to, to))) {
      return;
    }

    const reverse = edges.find((edge) => endpointsEqual(edge.from, to) && endpointsEqual(edge.to, from));

    if (reverse !== undefined) {
      if (reverse.direction !== "both") {
        const next: RoadmapEdge = { ...reverse, direction: "both" };

        this.commit(
          { ...this.stateValue, edges: { ...this.stateValue.edges, [reverse.id]: next } },
          { relations: true },
        );
      }

      return;
    }

    const edge = createEdge(from, to, asSide(fromHandle), asSide(toHandle));

    this.commit({ ...this.stateValue, edges: { ...this.stateValue.edges, [edge.id]: edge } }, { relations: true });
  }

  private endpointFor(id: string): RoadmapEndpoint {
    return this.stateValue.clusters[id] !== undefined ? { type: "cluster", id } : { type: "node", id };
  }

  /** Forbids linking a node to its own container — a self-loop of the cluster. Edges
   * between nodes of one cluster are allowed. */
  private isInternalConnection(from: RoadmapEndpoint, to: RoadmapEndpoint): boolean {
    const clusterOfNode = (id: string): string | null => this.stateValue.nodes[id]?.clusterId ?? null;

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
    this.deleteSelection([], ids, [], "keep-nodes");
  }

  deleteElements(nodeIds: readonly string[], edgeIds: readonly string[]): void {
    this.deleteSelection(nodeIds, edgeIds, [], "keep-nodes");
  }

  updateEdge(id: string, patch: EdgeUpdatePatch, options?: { history?: boolean }): void {
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

      setOptional(next, "label", label.length === 0 ? undefined : label);
    }

    if (patch.line !== undefined || patch.shape !== undefined || patch.color !== undefined) {
      const style = { ...edge.style };

      if (patch.line !== undefined) {
        setOptional(style, "line", patch.line === "solid" ? undefined : patch.line);
      }

      if (patch.shape !== undefined) {
        setOptional(style, "shape", patch.shape === "curved" ? undefined : patch.shape);
      }

      if (patch.color !== undefined) {
        setOptional(style, "color", patch.color === null || patch.color.length === 0 ? undefined : patch.color);
      }

      next.style = Object.keys(style).length > 0 ? style : undefined;
    }

    if (
      next.direction === edge.direction &&
      next.label === edge.label &&
      next.style?.line === edge.style?.line &&
      next.style?.shape === edge.style?.shape &&
      next.style?.color === edge.style?.color
    ) {
      return;
    }

    this.commit(
      { ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } },
      { relations: true, history: options?.history },
    );
  }

  reverseEdge(id: string): void {
    const edge = this.stateValue.edges[id];

    if (edge === undefined) {
      return;
    }

    const next: RoadmapEdge = { ...edge, from: edge.to, to: edge.from };

    setOptional(next, "fromSide", edge.toSide);
    setOptional(next, "toSide", edge.fromSide);
    this.commit({ ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } }, { relations: true });
  }

  setEdgeEndpointSide(id: string, end: "from" | "to", side: EdgeSide | undefined): void {
    const edge = this.stateValue.edges[id];

    if (edge === undefined) {
      return;
    }

    const next: RoadmapEdge = { ...edge };

    setOptional(next, end === "from" ? "fromSide" : "toSide", side);
    this.commit({ ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } });
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

    this.commit({ ...this.stateValue, viewport }, { history: false });
  }

  /**
   * Re-points file-backed node sources after a vault rename (file or folder prefix),
   * updating body blocks and relations. Outside the undo history: the vault rename is
   * an external fact, not a roadmap edit. Returns whether anything was re-pointed.
   */
  applySourceRename(oldPath: string, newPath: string): boolean {
    const prefix = `${oldPath}/`;
    const nodes = { ...this.stateValue.nodes };
    const repointed: RoadmapNode[] = [];

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
      repointed.push(next);
    }

    if (repointed.length === 0) {
      return false;
    }

    this.commit(
      { ...this.stateValue, nodes },
      {
        history: false,
        body: (content) => repointed.reduce((acc, node) => updateNodeBlock(acc, node), content),
        relations: true,
      },
    );

    return true;
  }

  /**
   * Re-points one or both ends of an edge to the given connection, keeping direction, label and
   * style. Both endpoints are rebuilt from the connection, so the untouched end stays as it was;
   * a null handle means that end floats. No-ops on a self-loop, a forbidden intra-cluster link,
   * or an exact duplicate of another edge; landing on the mirror of another edge merges into
   * it — the reconnected edge is dropped and the mirror becomes bidirectional, matching how
   * drawing a reverse edge behaves.
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

    const others = Object.values(this.stateValue.edges).filter((other) => other.id !== id);

    if (others.some((other) => endpointsEqual(other.from, from) && endpointsEqual(other.to, to))) {
      return;
    }

    const mirror = others.find((other) => endpointsEqual(other.from, to) && endpointsEqual(other.to, from));

    if (mirror !== undefined) {
      const edges = { ...this.stateValue.edges };

      delete edges[id];

      if (mirror.direction !== "both") {
        edges[mirror.id] = { ...mirror, direction: "both" };
      }

      this.commit({ ...this.stateValue, edges }, { relations: true });

      return;
    }

    const next: RoadmapEdge = { ...edge, from, to };

    setOptional(next, "fromSide", asSide(connection.sourceHandle));
    setOptional(next, "toSide", asSide(connection.targetHandle));
    this.commit({ ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } }, { relations: true });
  }
}

export interface RoadmapConnection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

type OptionalKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];

/** Sets an optional property or removes it entirely, so `undefined` never lands in state
 * (and therefore never leaks into the serialized compact form). */
function setOptional<T extends object, K extends OptionalKeys<T>>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(target, key);
  } else {
    target[key] = value;
  }
}

function endpointsEqual(a: RoadmapEndpoint, b: RoadmapEndpoint): boolean {
  return a.type === b.type && a.id === b.id;
}

/** Node with the meta patch applied, or null when nothing would effectively change. */
function withNodeMetaPatch(node: RoadmapNode, patch: NodeMetaPatch): RoadmapNode | null {
  const next: RoadmapNode = { ...node };

  if ("status" in patch) {
    setOptional(next, "status", patch.status ?? undefined);
  }

  if ("priority" in patch) {
    setOptional(next, "priority", patch.priority ?? undefined);
  }

  if ("title" in patch) {
    const title = patch.title == null ? "" : sanitizeInline(patch.title);

    setOptional(next, "title", title.length === 0 ? undefined : title);
  }

  if ("description" in patch) {
    const description = patch.description == null ? "" : sanitizeInline(patch.description);

    setOptional(next, "description", description.length === 0 ? undefined : description);
  }

  if ("color" in patch) {
    const style = { ...next.style };

    setOptional(style, "color", patch.color == null || patch.color.length === 0 ? undefined : patch.color);
    next.style = Object.keys(style).length > 0 ? style : undefined;
  }

  const unchanged =
    next.status === node.status &&
    next.priority === node.priority &&
    next.title === node.title &&
    next.description === node.description &&
    next.style?.color === node.style?.color;

  return unchanged ? null : next;
}

/** Node with the alignment patch merged over the default, or null when unchanged. */
function withAlignPatch(node: RoadmapNode, patch: { h?: TextAlignH; v?: TextAlignV }): RoadmapNode | null {
  const current = node.align ?? DEFAULT_TEXT_ALIGN;
  const align: TextAlign = { h: patch.h ?? current.h, v: patch.v ?? current.v };

  if (align.h === current.h && align.v === current.v && node.align !== undefined) {
    return null;
  }

  return { ...node, align };
}

/**
 * Drops edges that became a node↔own-container self-loop after membership changed
 * (a node dragged into a cluster it was linked to). Edges between nodes of one cluster
 * survive. Returns the original map when nothing changed, so callers can detect whether
 * Relations need a rewrite.
 */
function withoutInternalEdges(
  edges: Record<string, RoadmapEdge>,
  nodes: Record<string, RoadmapNode>,
): Record<string, RoadmapEdge> {
  const ownContainer = (node: RoadmapEndpoint, cluster: RoadmapEndpoint): boolean =>
    node.type === "node" && cluster.type === "cluster" && nodes[node.id]?.clusterId === cluster.id;
  const kept: Record<string, RoadmapEdge> = {};
  let changed = false;

  for (const [id, edge] of Object.entries(edges)) {
    if (ownContainer(edge.from, edge.to) || ownContainer(edge.to, edge.from)) {
      changed = true;
    } else {
      kept[id] = edge;
    }
  }

  return changed ? kept : edges;
}
