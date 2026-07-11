import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStore,
  useStoreApi,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import {
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { nanoid } from "nanoid";
import { asSide, type NodePlacement } from "../domain/create";
import { filterIsActive, nodeMatchesFilter, type NodeFilter } from "../domain/filter";
import type { RoadmapState, RoadmapViewport } from "../domain/types";
import type { AddNodeActionId } from "./addNodeActions";
import { ClusterNodeView } from "./ClusterNodeView";
import { FloatingEdge } from "./FloatingEdge";
import { getHelperLines } from "./alignment";
import { HelperLines } from "./HelperLines";
import { NodeCallbacksContext, type NodeCallbacks } from "./nodeCallbacks";
import { NodeFilterContext, type NodeDimPredicate } from "./nodeFilterContext";
import {
  absoluteNodePosition,
  nodeContainsPoint,
  nodeSize,
  normalizeClusterSelection,
  pointOverVisibleNode,
  reconcileFlowEdges,
  reconcileFlowNodes,
  ROADMAP_CLUSTER_TYPE,
  ROADMAP_EDGE_TYPE,
  ROADMAP_NODE_TYPE,
  stateToFlowEdges,
  stateToFlowNodes,
  type NodeImageResolver,
  type NodeMissingPredicate,
  type RoadmapFlowEdge,
  type RoadmapFlowInstance,
  type RoadmapFlowNode,
} from "./flow";
import { Icon } from "./Icon";
import { NodeFilterPanel } from "./NodeFilterPanel";
import { NodeSearchPanel } from "./NodeSearchPanel";
import { NodeToolbar } from "./NodeToolbar";
import { RF_EDGE_CLASS, RF_NODE_CLASS, RF_PANE_CLASS, RF_PANEL_CLASS } from "./reactFlowInternals";
import { RoadmapNodeView } from "./RoadmapNodeView";
import { RoadmapToolbar } from "./RoadmapToolbar";

const nodeTypes = {
  [ROADMAP_NODE_TYPE]: RoadmapNodeView,
  [ROADMAP_CLUSTER_TYPE]: ClusterNodeView,
};

const edgeTypes = { [ROADMAP_EDGE_TYPE]: FloatingEdge };

/** Ephemeral ids for alt-drag copies; the copies are replaced by real nodes on drop. */
const ALT_COPY_ID_PREFIX = "dup-";

/** Keeps the dragged alt-copies above resting cards, which sit at the default level. */
const ALT_COPY_Z_INDEX = 1000;

const DOUBLE_CLICK_ZOOM_FACTOR = 2;

const DOUBLE_CLICK_ZOOM_DURATION = 200;

/** Board-unit corner radius for mini-map node rects; scales down with the map. */
const MINIMAP_NODE_RADIUS = 8;

const SEARCH_CENTER_DURATION = 300;

/** Gentle focus zoom when jumping to a match: pulls a zoomed-out board in this far, but
 * never zooms out, so stepping through results does not creep the zoom level. */
const SEARCH_FOCUS_ZOOM = 1.2;

function clientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }

  const touch = event.changedTouches[0];

  return touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
}

export interface CanvasNodeActions {
  onMoved: (moves: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  onReparent: (items: ReadonlyArray<{ id: string; clusterId: string | null; x: number; y: number }>) => void;
  onDuplicate: (items: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  onResized: (id: string, width: number, height: number, x: number, y: number) => void;
  onOpen: (id: string, newLeaf: boolean) => void;
  onPreview: (id: string) => void;
  onContextMenu: (id: string, event: MouseEvent) => void;
  onSelectionContextMenu: (ids: string[], event: MouseEvent) => void;
  onSelectionChange: (ids: string[]) => void;
}

export interface CanvasEdgeActions {
  onConnect: (source: string, target: string, sourceHandle: string | null, targetHandle: string | null) => void;
  onReconnect: (id: string, connection: Connection) => void;
  onConnectToEmpty: (source: string, sourceHandle: string | null, placement: NodePlacement, event: MouseEvent) => void;
  onReconnectToEmpty: (edgeId: string) => void;
  onContextMenu: (id: string, event: MouseEvent) => void;
}

export interface CanvasClusterActions {
  onToggleCollapse: (id: string) => void;
  onArrange: (id: string) => void;
}

export interface CanvasBoardActions {
  onUndo: () => void;
  onRedo: () => void;
  onToggleLock: () => void;
  onAutoLayout: () => void;
  onExportPdf: () => void;
  onDotsVisibleChange: (value: boolean) => void;
  onMiniMapVisibleChange: (value: boolean) => void;
  onViewportChange: (viewport: RoadmapViewport) => void;
  onFlowInit: (instance: RoadmapFlowInstance | null) => void;
  onAddAction: (id: AddNodeActionId, placement: NodePlacement) => void;
  onPaneContextMenu: (placement: NodePlacement, event: MouseEvent) => void;
  onDropFiles: (placement: NodePlacement, dataTransfer: DataTransfer | null) => void;
  onDeleteElements: (nodeIds: string[], edgeIds: string[]) => void;
}

/**
 * Callbacks are grouped by concern so the canvas surface stays narrow; the view keeps
 * each group as a stable object, and hooks below depend on the destructured functions.
 */
interface RoadmapCanvasProps {
  state: RoadmapState;
  locked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  initialDotsVisible: boolean;
  initialMiniMapVisible: boolean;
  /** Bumping `openSearchNonce` opens the find bar (palette command entry point). */
  openSearchNonce: number;
  /** Bumping `openFilterNonce` opens the filter bar (palette command entry point). */
  openFilterNonce: number;
  /** Bumping `focusNonce` re-selects exactly `focusIds` (paste and duplicate flows).
   * Applied through the store a tick later: right after an alt-drag drop the committed
   * duplicates have not reached the store yet, and the gesture's trailing events hand
   * selection back to the source. */
  focusIds: string[];
  focusNonce: number;
  isNodeMissing: NodeMissingPredicate;
  resolveImageSrc: NodeImageResolver;
  nodeActions: CanvasNodeActions;
  edgeActions: CanvasEdgeActions;
  clusterActions: CanvasClusterActions;
  boardActions: CanvasBoardActions;
}

export function RoadmapCanvas({
  state,
  locked,
  canUndo,
  canRedo,
  initialDotsVisible,
  initialMiniMapVisible,
  openSearchNonce,
  openFilterNonce,
  focusIds,
  focusNonce,
  isNodeMissing,
  resolveImageSrc,
  nodeActions,
  edgeActions,
  clusterActions,
  boardActions,
}: RoadmapCanvasProps) {
  const {
    onMoved: onNodesMoved,
    onReparent: onNodesReparent,
    onDuplicate: onNodesDuplicate,
    onResized: onNodeResized,
    onOpen: onNodeOpen,
    onPreview: onNodePreview,
    onContextMenu: onNodeContextMenu,
    onSelectionContextMenu,
    onSelectionChange,
  } = nodeActions;
  const {
    onConnect: onConnectNodes,
    onReconnect: onReconnectEdge,
    onConnectToEmpty,
    onReconnectToEmpty,
    onContextMenu: onEdgeContextMenu,
  } = edgeActions;
  const { onToggleCollapse: onClusterToggleCollapse, onArrange: onClusterArrange } = clusterActions;
  const {
    onUndo,
    onRedo,
    onToggleLock,
    onAutoLayout,
    onExportPdf,
    onDotsVisibleChange,
    onMiniMapVisibleChange,
    onViewportChange,
    onFlowInit,
    onAddAction,
    onPaneContextMenu,
    onDropFiles,
    onDeleteElements,
  } = boardActions;
  const reactFlow = useReactFlow<RoadmapFlowNode, RoadmapFlowEdge>();
  const { screenToFlowPosition, getNodes, getViewport, setViewport, setCenter } = reactFlow;
  const storeApi = useStoreApi<RoadmapFlowNode, RoadmapFlowEdge>();
  const minZoom = useStore((store) => store.minZoom);
  const maxZoom = useStore((store) => store.maxZoom);
  const flowId = useId();
  const [dotsVisible, setDotsVisible] = useState(initialDotsVisible);
  const [miniMapVisible, setMiniMapVisible] = useState(initialMiniMapVisible);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<ReadonlySet<string>>(() => new Set());
  const [filterPriorities, setFilterPriorities] = useState<ReadonlySet<string>>(() => new Set());
  const initialViewportRef = useRef(state.viewport);
  const [nodes, setNodes] = useState<RoadmapFlowNode[]>(() => stateToFlowNodes(state, isNodeMissing, resolveImageSrc));
  const [edges, setEdges] = useState<RoadmapFlowEdge[]>(() => stateToFlowEdges(state));
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({});
  /** Alt-drag duplicate state. A rubber-band drag fires both onNodeDragStop and
   * onSelectionDragStop for one gesture; `finalized` makes the second finalize a no-op. */
  const altDragRef = useRef<{
    map: Map<string, string>;
    frozen: Map<string, { x: number; y: number }>;
    finalized: boolean;
  } | null>(null);
  const reconnectRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const pendingTimersRef = useRef<Set<number>>(new Set());

  /** Runs `fn` on the next tick, after React Flow's own event handling for the gesture;
   * unmounting mid-gesture cancels pending callbacks instead of updating a torn-down tree. */
  const deferOnce = useCallback((fn: () => void): void => {
    const id = window.setTimeout(() => {
      pendingTimersRef.current.delete(id);
      fn();
    }, 0);

    pendingTimersRef.current.add(id);
  }, []);

  useEffect(
    () => () => {
      for (const id of pendingTimersRef.current) {
        window.clearTimeout(id);
      }

      pendingTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    stateRef.current = state;
    setNodes((current) => reconcileFlowNodes(current, stateToFlowNodes(state, isNodeMissing, resolveImageSrc)));
    setEdges((current) => reconcileFlowEdges(current, stateToFlowEdges(state)));
  }, [state, isNodeMissing, resolveImageSrc]);

  useEffect(() => {
    onFlowInit(reactFlow);

    return () => onFlowInit(null);
  }, [reactFlow, onFlowInit]);

  useEffect(() => {
    if (focusNonce === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      storeApi.getState().addSelectedNodes(focusIds);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusNonce, focusIds, storeApi]);

  /** Remove changes are suppressed here and in `onEdgesChange`: deletion goes through
   * the session and may await a confirmation dialog, so React Flow's optimistic
   * removals would leave the board visually missing elements when the user cancels. */
  const onNodesChange = useCallback(
    (rawChanges: NodeChange<RoadmapFlowNode>[]) => {
      const changes = rawChanges.filter((change) => change.type !== "remove");

      if (changes.length === 0) {
        return;
      }

      const alt = altDragRef.current;

      if (alt !== null) {
        const augmented: NodeChange<RoadmapFlowNode>[] = [];

        for (const change of changes) {
          if (change.type === "position" && change.position !== undefined && alt.map.has(change.id)) {
            const copyId = alt.map.get(change.id) as string;
            const frozen = alt.frozen.get(change.id) as { x: number; y: number };

            augmented.push({
              id: copyId,
              type: "position",
              position: { x: change.position.x, y: change.position.y },
              dragging: change.dragging,
            });
            augmented.push({
              id: change.id,
              type: "position",
              position: { x: frozen.x, y: frozen.y },
              dragging: change.dragging,
            });
          } else {
            augmented.push(change);
          }
        }

        setNodes((current) => normalizeClusterSelection(applyNodeChanges(augmented, current)));

        return;
      }

      let lines: { horizontal?: number; vertical?: number } = {};
      const [first] = changes;
      const activeNode = first?.type === "position" ? getNodes().find((node) => node.id === first.id) : undefined;

      if (
        changes.length === 1 &&
        first?.type === "position" &&
        first.dragging === true &&
        first.position !== undefined &&
        activeNode !== undefined
      ) {
        const parentId = activeNode.parentId;
        const parent = parentId == null ? undefined : getNodes().find((n) => n.id === parentId);
        const siblings = getNodes().filter((n) => (parentId == null ? n.parentId == null : n.parentId === parentId));
        const offsetX = parent?.position.x ?? 0;
        const offsetY = parent?.position.y ?? 0;
        const result = getHelperLines(first, siblings);

        if (result.snapX !== undefined) {
          first.position.x = result.snapX;
        }

        if (result.snapY !== undefined) {
          first.position.y = result.snapY;
        }

        lines = {
          horizontal: result.horizontal === undefined ? undefined : result.horizontal + offsetY,
          vertical: result.vertical === undefined ? undefined : result.vertical + offsetX,
        };
      }

      setHelperLines((prev) =>
        prev.horizontal === lines.horizontal && prev.vertical === lines.vertical ? prev : lines,
      );
      setNodes((current) => normalizeClusterSelection(applyNodeChanges(changes, current)));
    },
    [getNodes],
  );

  const onEdgesChange = useCallback((rawChanges: EdgeChange<RoadmapFlowEdge>[]) => {
    const changes = rawChanges.filter((change) => change.type !== "remove");

    if (changes.length === 0) {
      return;
    }

    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle, targetHandle } = connection;

      if (source !== null && target !== null && source !== target) {
        onConnectNodes(source, target, sourceHandle, targetHandle);
      }
    },
    [onConnectNodes],
  );

  /** Applies the new endpoints optimistically to avoid a one-frame flash of the old
   * edge. A reconnect the session rejects (self-loop, duplicate, own-container link)
   * commits no state and nothing would undo the optimistic change, so a deferred
   * re-sync restores the edges from the latest state. */
  const onReconnect = useCallback(
    (oldEdge: RoadmapFlowEdge, connection: Connection) => {
      if (connection.source === connection.target) {
        return;
      }

      setEdges((current) =>
        current.map((edge) =>
          edge.id === oldEdge.id
            ? {
                ...edge,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle,
                targetHandle: connection.targetHandle,
                data:
                  edge.data === undefined
                    ? edge.data
                    : {
                        ...edge.data,
                        fromSide: asSide(connection.sourceHandle),
                        toSide: asSide(connection.targetHandle),
                      },
              }
            : edge,
        ),
      );
      onReconnectEdge(oldEdge.id, connection);
      deferOnce(() => {
        setEdges((current) => reconcileFlowEdges(current, stateToFlowEdges(stateRef.current)));
      });
    },
    [onReconnectEdge, deferOnce],
  );

  const onReconnectStart = useCallback((_event: ReactMouseEvent, edge: RoadmapFlowEdge) => {
    reconnectRef.current = edge.id;
  }, []);

  /** Clears the reconnect ref on the next tick: onConnectEnd needs it and may fire
   * after this handler. */
  const onReconnectEnd = useCallback(() => {
    deferOnce(() => {
      reconnectRef.current = null;
    });
  }, [deferOnce]);

  const nodeAtPoint = useCallback(
    (point: { x: number; y: number }): boolean => pointOverVisibleNode(getNodes(), point),
    [getNodes],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connection: FinalConnectionState) => {
      const fromNodeId = connection.fromHandle?.nodeId;
      const client = clientPoint(event);

      if (fromNodeId === undefined || client === null) {
        return;
      }

      const point = screenToFlowPosition(client);

      if (connection.toNode !== null || nodeAtPoint(point)) {
        return;
      }

      const reconnectingEdgeId = reconnectRef.current;

      if (reconnectingEdgeId !== null) {
        onReconnectToEmpty(reconnectingEdgeId);

        return;
      }

      onConnectToEmpty(fromNodeId, connection.fromHandle?.id ?? null, point, event as MouseEvent);
    },
    [screenToFlowPosition, nodeAtPoint, onConnectToEmpty, onReconnectToEmpty],
  );

  /** Spawns ephemeral copies of the dragged nodes, and of the edges between them, that
   * travel with the drag; on drop the committed state swaps the placeholders for the
   * persisted duplicates. */
  const startAltDuplicate = useCallback((dragged: RoadmapFlowNode[]) => {
    const map = new Map<string, string>();
    const frozen = new Map<string, { x: number; y: number }>();
    const copies: RoadmapFlowNode[] = [];

    for (const node of dragged) {
      if (node.type === ROADMAP_CLUSTER_TYPE) {
        continue;
      }

      const copyId = `${ALT_COPY_ID_PREFIX}${nanoid()}`;

      map.set(node.id, copyId);
      frozen.set(node.id, { x: node.position.x, y: node.position.y });
      copies.push({ ...node, id: copyId, selected: false, dragging: true, zIndex: ALT_COPY_Z_INDEX });
    }

    if (copies.length === 0) {
      return;
    }

    altDragRef.current = { map, frozen, finalized: false };
    setNodes((current) => [...current, ...copies]);
    setEdges((current) => [
      ...current,
      ...current
        .filter((edge) => map.has(edge.source) && map.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: `${ALT_COPY_ID_PREFIX}${nanoid()}`,
          source: map.get(edge.source) as string,
          target: map.get(edge.target) as string,
          selected: false,
        })),
    ]);
  }, []);

  /**
   * Commits the alt-drag copies at their final positions and pins the originals back to
   * their pre-drag spots; the temp copies stay until the committed state swaps them for
   * the real duplicates. The freeze interceptor stays armed one more tick — selection
   * drags can emit a trailing position change after the stop handler. Returns false
   * when no alt-drag is active.
   */
  const finalizeAltDuplicate = useCallback((): boolean => {
    const alt = altDragRef.current;

    if (alt === null) {
      return false;
    }

    if (alt.finalized) {
      return true;
    }

    alt.finalized = true;

    deferOnce(() => {
      if (altDragRef.current === alt) {
        altDragRef.current = null;
      }
    });

    const all = getNodes();
    const items: { id: string; x: number; y: number }[] = [];

    for (const [originalId, copyId] of alt.map) {
      const copy = all.find((node) => node.id === copyId);

      if (copy !== undefined) {
        const absolute = absoluteNodePosition(copy, all);

        items.push({ id: originalId, x: absolute.x, y: absolute.y });
      }
    }

    setNodes((current) =>
      current.map((node) => {
        const frozen = alt.frozen.get(node.id);

        return frozen === undefined ? node : { ...node, position: frozen, dragging: false };
      }),
    );
    onNodesDuplicate(items);

    return true;
  }, [getNodes, onNodesDuplicate, deferOnce]);

  const onNodeDragStart = useCallback(
    (event: MouseEvent | TouchEvent, _node: RoadmapFlowNode, dragged: RoadmapFlowNode[]) => {
      if ("altKey" in event && event.altKey) {
        startAltDuplicate(dragged);
      }
    },
    [startAltDuplicate],
  );

  const onSelectionDragStart = useCallback(
    (event: ReactMouseEvent, dragged: RoadmapFlowNode[]) => {
      if (event.altKey) {
        startAltDuplicate(dragged);
      }
    },
    [startAltDuplicate],
  );

  const clusterAtPoint = useCallback(
    (point: { x: number; y: number }): string | null => {
      const cluster = getNodes().find(
        (node) => node.type === ROADMAP_CLUSTER_TYPE && !node.data.collapsed && nodeContainsPoint(node, point),
      );

      return cluster?.id ?? null;
    },
    [getNodes],
  );

  const commitDrag = useCallback(
    (dragged: RoadmapFlowNode[]) => {
      const moves: { id: string; x: number; y: number }[] = [];
      const reparents: { id: string; clusterId: string | null; x: number; y: number }[] = [];

      for (const node of dragged) {
        if (node.type === ROADMAP_CLUSTER_TYPE) {
          moves.push({ id: node.id, x: node.position.x, y: node.position.y });
          continue;
        }

        const absolute = absoluteNodePosition(node, getNodes());
        const { width, height } = nodeSize(node);
        const target = clusterAtPoint({ x: absolute.x + width / 2, y: absolute.y + height / 2 });

        if (target !== (node.parentId ?? null)) {
          reparents.push({ id: node.id, clusterId: target, x: absolute.x, y: absolute.y });
        } else {
          moves.push({ id: node.id, x: node.position.x, y: node.position.y });
        }
      }

      if (reparents.length > 0) {
        onNodesReparent(reparents);
      }

      if (moves.length > 0) {
        onNodesMoved(moves);
      }
    },
    [getNodes, clusterAtPoint, onNodesReparent, onNodesMoved],
  );

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: RoadmapFlowNode, dragged: RoadmapFlowNode[]) => {
      if (!finalizeAltDuplicate()) {
        commitDrag(dragged);
      }
    },
    [finalizeAltDuplicate, commitDrag],
  );

  const onSelectionDragStop = useCallback(
    (_event: ReactMouseEvent, dragged: RoadmapFlowNode[]) => {
      if (!finalizeAltDuplicate()) {
        commitDrag(dragged);
      }
    },
    [finalizeAltDuplicate, commitDrag],
  );

  const onSelectionChangeInternal = useCallback(
    ({ nodes: selected }: { nodes: RoadmapFlowNode[] }) => {
      onSelectionChange(selected.map((node) => node.id));
    },
    [onSelectionChange],
  );

  const onNodeDoubleClick = useCallback(
    (event: ReactMouseEvent, node: RoadmapFlowNode) => {
      if (event.ctrlKey || event.metaKey) {
        onNodeOpen(node.id, true);
      } else {
        onNodePreview(node.id);
      }
    },
    [onNodeOpen, onNodePreview],
  );

  const onEdgeContextMenuInternal = useCallback(
    (event: ReactMouseEvent, edge: RoadmapFlowEdge) => {
      event.preventDefault();
      onEdgeContextMenu(edge.id, event.nativeEvent);
    },
    [onEdgeContextMenu],
  );

  const onNodeContextMenuInternal = useCallback(
    (event: ReactMouseEvent, node: RoadmapFlowNode) => {
      event.preventDefault();
      onNodeContextMenu(node.id, event.nativeEvent);
    },
    [onNodeContextMenu],
  );

  const onSelectionContextMenuInternal = useCallback(
    (event: ReactMouseEvent, selected: RoadmapFlowNode[]) => {
      event.preventDefault();
      onSelectionContextMenu(
        selected.map((node) => node.id),
        event.nativeEvent,
      );
    },
    [onSelectionContextMenu],
  );

  const onPaneContextMenuInternal = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault();
      const native = "nativeEvent" in event ? event.nativeEvent : event;
      const placement = screenToFlowPosition({ x: native.clientX, y: native.clientY });

      onPaneContextMenu(placement, native);
    },
    [screenToFlowPosition, onPaneContextMenu],
  );

  /** React Flow also enumerates edges connected to the deleted nodes — including edges
   * of cluster members, which survive a keep-nodes cluster delete. Only explicitly
   * selected edges pass; the rest follow their endpoints in the session. */
  const onDeleteInternal = useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }: { nodes: RoadmapFlowNode[]; edges: RoadmapFlowEdge[] }) => {
      onDeleteElements(
        deletedNodes.map((node) => node.id),
        deletedEdges.filter((edge) => edge.selected === true).map((edge) => edge.id),
      );
    },
    [onDeleteElements],
  );

  /**
   * Double-click zoom for the empty pane only. React Flow's built-in one is disabled:
   * its filter lets the gesture through on non-draggable (locked) nodes, hijacking the
   * open-on-double-click semantics of cards and clusters.
   */
  const onCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as Element;

      if (
        target.closest(`.${RF_NODE_CLASS}, .${RF_EDGE_CLASS}, .${RF_PANEL_CLASS}`) !== null ||
        target.closest(`.${RF_PANE_CLASS}`) === null
      ) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const { zoom } = getViewport();
      const factor = event.shiftKey ? 1 / DOUBLE_CLICK_ZOOM_FACTOR : DOUBLE_CLICK_ZOOM_FACTOR;
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom * factor));
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      void setViewport(
        {
          x: event.clientX - rect.left - point.x * nextZoom,
          y: event.clientY - rect.top - point.y * nextZoom,
          zoom: nextZoom,
        },
        { duration: DOUBLE_CLICK_ZOOM_DURATION },
      );
    },
    [getViewport, setViewport, screenToFlowPosition, minZoom, maxZoom],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const placement = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      onDropFiles(placement, event.dataTransfer);
    },
    [screenToFlowPosition, onDropFiles],
  );

  const toggleDots = useCallback(() => {
    const next = !dotsVisible;

    setDotsVisible(next);
    onDotsVisibleChange(next);
  }, [dotsVisible, onDotsVisibleChange]);

  const toggleMiniMap = useCallback(() => {
    const next = !miniMapVisible;

    setMiniMapVisible(next);
    onMiniMapVisibleChange(next);
  }, [miniMapVisible, onMiniMapVisibleChange]);

  /** Search and filter share the top-centre slot, so opening one closes the other. */
  const toggleSearch = useCallback(() => {
    setFilterOpen(false);
    setSearchOpen((open) => !open);
  }, []);

  const toggleFilter = useCallback(() => {
    setSearchOpen(false);
    setFilterOpen((open) => !open);
  }, []);

  useEffect(() => {
    if (openSearchNonce > 0) {
      setFilterOpen(false);
      setSearchOpen(true);
    }
  }, [openSearchNonce]);

  useEffect(() => {
    if (openFilterNonce > 0) {
      setSearchOpen(false);
      setFilterOpen(true);
    }
  }, [openFilterNonce]);

  const toggleFilterValue = useCallback((kind: "status" | "priority", value: string) => {
    const setSelected = kind === "status" ? setFilterStatuses : setFilterPriorities;

    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }

      return next;
    });
  }, []);

  const clearFilter = useCallback(() => {
    setFilterStatuses(new Set());
    setFilterPriorities(new Set());
  }, []);

  const filter = useMemo<NodeFilter>(
    () => ({ statuses: filterStatuses, priorities: filterPriorities }),
    [filterStatuses, filterPriorities],
  );
  const filterActive = filterIsActive(filter);
  const dimPredicate = useCallback<NodeDimPredicate>(
    (status, priority) => filterActive && !nodeMatchesFilter({ status, priority }, filter),
    [filter, filterActive],
  );

  /** Selects exactly the matched node and pans the camera to it, keeping the current zoom. */
  const focusMatch = useCallback(
    (id: string) => {
      const all = getNodes();
      const node = all.find((candidate) => candidate.id === id);

      if (node === undefined) {
        return;
      }

      const { x, y } = absoluteNodePosition(node, all);
      const { width, height } = nodeSize(node);
      const store = storeApi.getState();

      store.unselectNodesAndEdges();
      store.addSelectedNodes([id]);
      const zoom = Math.min(maxZoom, Math.max(getViewport().zoom, SEARCH_FOCUS_ZOOM));

      void setCenter(x + width / 2, y + height / 2, { zoom, duration: SEARCH_CENTER_DURATION });
    },
    [getNodes, storeApi, setCenter, getViewport, maxZoom],
  );

  const miniMapNodeColor = useCallback(
    (node: RoadmapFlowNode): string => node.data.color ?? "var(--rm-minimap-node)",
    [],
  );

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: RoadmapViewport) => {
      onViewportChange(viewport);
    },
    [onViewportChange],
  );

  const nodeCallbacks = useMemo<NodeCallbacks>(
    () => ({ locked, onResizeEnd: onNodeResized, onClusterToggleCollapse, onClusterArrange }),
    [locked, onNodeResized, onClusterToggleCollapse, onClusterArrange],
  );

  return (
    <NodeCallbacksContext.Provider value={nodeCallbacks}>
      <NodeFilterContext.Provider value={dimPredicate}>
        <div
          className="rm-canvas"
          data-locked={locked}
          onDoubleClick={onCanvasDoubleClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            id={flowId}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            edgesReconnectable={!locked}
            edgesFocusable={!locked}
            onConnectEnd={onConnectEnd}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onSelectionDragStart={onSelectionDragStart}
            onSelectionDragStop={onSelectionDragStop}
            onSelectionChange={onSelectionChangeInternal}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeContextMenu={onNodeContextMenuInternal}
            onSelectionContextMenu={onSelectionContextMenuInternal}
            onEdgeContextMenu={onEdgeContextMenuInternal}
            onPaneContextMenu={onPaneContextMenuInternal}
            onDelete={onDeleteInternal}
            onMoveEnd={onMoveEnd}
            deleteKeyCode={locked ? null : ["Backspace", "Delete"]}
            multiSelectionKeyCode="Shift"
            selectionKeyCode={null}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1, 2]}
            panOnScroll
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
            defaultViewport={initialViewportRef.current}
            fitView={initialViewportRef.current === undefined}
          >
            {dotsVisible ? <Background variant={BackgroundVariant.Dots} /> : null}
            {miniMapVisible ? (
              <MiniMap
                className="rm-minimap"
                position="bottom-right"
                ariaLabel="Mini-map"
                pannable
                zoomable
                nodeColor={miniMapNodeColor}
                nodeBorderRadius={MINIMAP_NODE_RADIUS}
                maskColor="var(--rm-minimap-mask)"
              />
            ) : null}
            <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
            {!locked ? <NodeToolbar onAction={onAddAction} /> : null}
            {searchOpen ? (
              <NodeSearchPanel state={state} onActivate={focusMatch} onClose={() => setSearchOpen(false)} />
            ) : null}
            {filterOpen ? (
              <NodeFilterPanel
                statuses={filterStatuses}
                priorities={filterPriorities}
                onToggle={toggleFilterValue}
                onClear={clearFilter}
                onClose={() => setFilterOpen(false)}
              />
            ) : null}
            <RoadmapToolbar
              dotsVisible={dotsVisible}
              onToggleDots={toggleDots}
              miniMapVisible={miniMapVisible}
              onToggleMiniMap={toggleMiniMap}
              searchOpen={searchOpen}
              onToggleSearch={toggleSearch}
              filterOpen={filterOpen}
              filterActive={filterActive}
              onToggleFilter={toggleFilter}
              locked={locked}
              onToggleLock={onToggleLock}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={onUndo}
              onRedo={onRedo}
              onAutoLayout={onAutoLayout}
              onExportPdf={onExportPdf}
            />
          </ReactFlow>
          {nodes.length === 0 && !locked ? (
            <div className="rm-empty">
              <span className="rm-empty__icon">
                <Icon name="map" />
              </span>
              <span className="rm-empty__title">This board is empty</span>
              <span className="rm-empty__hint">Right-click the canvas or use the toolbar to add the first node</span>
            </div>
          ) : null}
        </div>
      </NodeFilterContext.Provider>
    </NodeCallbacksContext.Provider>
  );
}
