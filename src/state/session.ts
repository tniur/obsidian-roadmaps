import { CLUSTER_PADDING } from "../constants";
import { arrangeClusterGrid, membersBoundingBox } from "../domain/clusterLayout";
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
 * Every mutation funnels through `commit`, which owns that persist policy.
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

  addNodes(nodes: readonly RoadmapNode[]): void {
    if (nodes.length === 0) {
      return;
    }

    const next = { ...this.stateValue.nodes };

    for (const node of nodes) {
      next[node.id] = node;
    }

    this.commit(
      { ...this.stateValue, nodes: next },
      { body: (content) => nodes.reduce((acc, node) => insertNodeBlock(acc, node), content) },
    );
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

    const box = membersBoundingBox(members);

    if (box === null) {
      return;
    }

    const layout = {
      x: box.x - CLUSTER_PADDING,
      y: box.y - CLUSTER_PADDING,
      width: box.width + CLUSTER_PADDING * 2,
      height: box.height + CLUSTER_PADDING * 2,
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

      if (node === undefined) {
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

      if (cluster === undefined) {
        continue;
      }

      clusters[id] = { ...cluster, layout: { ...cluster.layout, x, y } };
      changed = true;
    }

    if (changed) {
      this.commit({ ...this.stateValue, clusters });
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

    const next = { ...cluster, title: safeTitle };

    this.commit(
      { ...this.stateValue, clusters: { ...this.stateValue.clusters, [id]: next } },
      { body: (content) => replaceClusterHeading(content, next), relations: true },
    );
  }

  setClusterColor(id: string, color: string | null): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined || (cluster.style?.color ?? null) === (color === "" ? null : color)) {
      return;
    }

    const style = { ...cluster.style };

    setOptional(style, "color", color === null || color.length === 0 ? undefined : color);
    const next = { ...cluster, style: Object.keys(style).length > 0 ? style : undefined };

    this.commit({ ...this.stateValue, clusters: { ...this.stateValue.clusters, [id]: next } });
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
   * their body blocks out to the unclustered region so they survive as top-level. */
  dissolveCluster(id: string): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

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
    this.commit(
      { ...this.stateValue, nodes, clusters, edges: this.edgesWithoutEndpoints(new Set([id])) },
      { body: (content) => dissolveClusterSection(content, id, memberIds), relations: true },
    );
  }

  /** Deletes the cluster and removes its member nodes from the roadmap. Source files are not
   * touched: removing entities from the roadmap must never delete vault files. */
  deleteClusterAndNodes(id: string): void {
    const cluster = this.stateValue.clusters[id];

    if (cluster === undefined) {
      return;
    }

    const memberIds = this.memberNodeIds(id);
    const nodes = { ...this.stateValue.nodes };

    for (const memberId of memberIds) {
      delete nodes[memberId];
    }

    const clusters = { ...this.stateValue.clusters };

    delete clusters[id];
    this.commit(
      { ...this.stateValue, nodes, clusters, edges: this.edgesWithoutEndpoints(new Set([id, ...memberIds])) },
      {
        body: (content) => removeClusterHeading(memberIds.reduce(removeNodeBlock, content), id),
        relations: true,
      },
    );
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

    this.commit({ ...this.stateValue, nodes: { ...this.stateValue.nodes, [id]: { ...node, align } } });
  }

  updateNodeMeta(id: string, patch: NodeMetaPatch): void {
    const node = this.stateValue.nodes[id];

    if (node === undefined) {
      return;
    }

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

    if (
      next.status === node.status &&
      next.priority === node.priority &&
      next.title === node.title &&
      next.description === node.description &&
      next.style?.color === node.style?.color
    ) {
      return;
    }

    const touchesBody = "status" in patch || "priority" in patch || "title" in patch || "description" in patch;

    this.commit(
      { ...this.stateValue, nodes: { ...this.stateValue.nodes, [id]: next } },
      {
        body: touchesBody ? (content) => updateNodeBlock(content, next) : undefined,
        relations: "title" in patch,
      },
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
    const present = ids.filter((id) => this.stateValue.nodes[id] !== undefined);

    if (present.length === 0) {
      return;
    }

    const nodes = { ...this.stateValue.nodes };

    for (const id of present) {
      delete nodes[id];
    }

    this.commit(
      { ...this.stateValue, nodes, edges: this.edgesWithoutEndpoints(new Set(present)) },
      { body: (content) => present.reduce(removeNodeBlock, content), relations: true },
    );
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

  /** Forbids direct connections inside one cluster: node↔node sharing a cluster, or a node
   * linking to its own container. Cross-cluster links are allowed. */
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

    const edges = { ...this.stateValue.edges };

    for (const id of present) {
      delete edges[id];
    }

    this.commit({ ...this.stateValue, edges }, { relations: true });
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

    const nodes = { ...this.stateValue.nodes };

    for (const id of removed) {
      delete nodes[id];
    }

    const edges = { ...this.stateValue.edges };

    for (const id of droppedEdges) {
      delete edges[id];
    }

    this.commit(
      { ...this.stateValue, nodes, edges },
      { body: (content) => [...removed].reduce(removeNodeBlock, content), relations: true },
    );
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

      setOptional(next, "label", label.length === 0 ? undefined : label);
    }

    if (patch.line !== undefined) {
      const style = { ...edge.style };

      setOptional(style, "line", patch.line === "solid" ? undefined : patch.line);
      next.style = Object.keys(style).length > 0 ? style : undefined;
    }

    if (next.direction === edge.direction && next.label === edge.label && next.style?.line === edge.style?.line) {
      return;
    }

    this.commit({ ...this.stateValue, edges: { ...this.stateValue.edges, [id]: next } }, { relations: true });
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

function endpointNodeId(endpoint: RoadmapEdge["from"]): string {
  return endpoint.type === "node" ? endpoint.id : "";
}

function endpointsEqual(a: RoadmapEndpoint, b: RoadmapEndpoint): boolean {
  return a.type === b.type && a.id === b.id;
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
