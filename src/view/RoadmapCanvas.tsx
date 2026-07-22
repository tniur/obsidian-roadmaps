import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  NodeToolbar as FlowNodeToolbar,
  Position,
  ReactFlow,
  SelectionMode,
  useInternalNode,
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
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { nanoid } from "nanoid";
import { BACKGROUND_DOT_GAP, BACKGROUND_DOT_SIZE, FIT_VIEW_PADDING, MAX_ZOOM, MIN_ZOOM } from "../constants";
import { asSide, type NodePlacement } from "../domain/create";
import { filterIsActive, nodeMatchesFilter, type NodeFilter } from "../domain/filter";
import { boardProgress } from "../domain/progress";
import type { RoadmapState, RoadmapViewport } from "../domain/types";
import type { AddNodeActionId } from "./addNodeActions";
import { ClusterNodeView } from "./ClusterNodeView";
import { getEdgeEndpoints } from "./edgeParams";
import { FloatingEdge } from "./FloatingEdge";
import { ClusterBubble, EdgeBubble, NodeBubble } from "./menus/bubbles";
import { AddActionRows, CardMenu, SelectionCard } from "./menus/cards";
import type { CanvasMenuActions } from "./menus/menuActions";
import { getHelperLines } from "./alignment";
import { HelperLines } from "./HelperLines";
import { NodeCallbacksContext, type NodeCallbacks } from "./nodeCallbacks";
import { NodeFilterContext, type NodeDimPredicate } from "./nodeFilterContext";
import {
  absoluteNodePosition,
  isCardNode,
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
  type NodeFileInfoResolver,
  type NodeImageResolver,
  type NodeMissingPredicate,
  type RoadmapCardNode,
  type RoadmapFlowEdge,
  type RoadmapFlowInstance,
  type RoadmapFlowNode,
} from "./flow";
import { Icon } from "./Icon";
import { NodeFilterPanel } from "./NodeFilterPanel";
import { NodeSearchPanel } from "./NodeSearchPanel";
import { NodeToolbar } from "./NodeToolbar";
import { ProgressIsland } from "./ProgressIsland";
import { RF_EDGE_CLASS, RF_NODE_CLASS, RF_PANE_CLASS, RF_PANEL_CLASS } from "./reactFlowInternals";
import { RoadmapNodeView } from "./RoadmapNodeView";
import { RoadmapToolbar } from "./RoadmapToolbar";

const nodeTypes = {
  [ROADMAP_NODE_TYPE]: RoadmapNodeView,
  [ROADMAP_CLUSTER_TYPE]: ClusterNodeView,
};

const edgeTypes = { [ROADMAP_EDGE_TYPE]: FloatingEdge };

/**
 * Screen-space anchor for the edge bubble: tracks the midpoint of the selected edge
 * through pans and zooms, so the toolbar keeps a constant size like the node toolbars.
 */
function EdgeBubbleAnchor({ edge, children }: { edge: RoadmapFlowEdge; children: ReactNode }) {
  const source = useInternalNode(edge.source);
  const target = useInternalNode(edge.target);
  const transform = useStore((store) => store.transform);

  if (source === undefined || target === undefined) {
    return null;
  }

  const ends = getEdgeEndpoints(source, target, edge.data?.fromSide, edge.data?.toSide);
  const x = ((ends.sx + ends.tx) / 2) * transform[2] + transform[0];
  const y = ((ends.sy + ends.ty) / 2) * transform[2] + transform[1];

  return (
    <div className="rm-edge-bubble" style={{ transform: `translate(${x}px, ${y}px)` }}>
      {children}
    </div>
  );
}

/**
 * Pins its children to a board coordinate through the live viewport transform, so a card
 * menu opened at a click point rides along with the canvas on pan and zoom.
 */
function FlowAnchor({ point, children }: { point: { x: number; y: number }; children: ReactNode }) {
  const transform = useStore((store) => store.transform);
  const x = point.x * transform[2] + transform[0];
  const y = point.y * transform[2] + transform[1];

  return (
    <div className="rm-flow-anchor" style={{ transform: `translate(${x}px, ${y}px)` }}>
      {children}
    </div>
  );
}

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
  onSelectionChange: (ids: string[]) => void;
}

export interface CanvasEdgeActions {
  onConnect: (source: string, target: string, sourceHandle: string | null, targetHandle: string | null) => void;
  onReconnect: (id: string, connection: Connection) => void;
  onReconnectToEmpty: (edgeId: string) => void;
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
  onExportPng: () => void;
  onExportCanvas: () => void;
  onOpenSettings: () => void;
  onDotsVisibleChange: (value: boolean) => void;
  onMiniMapVisibleChange: (value: boolean) => void;
  onAddBarVisibleChange: (value: boolean) => void;
  onProgressVisibleChange: (value: boolean) => void;
  onProgressCornerChange: (value: boolean) => void;
  onProgressCompactChange: (value: boolean) => void;
  onCompactControlsChange: (value: boolean) => void;
  onViewportChange: (viewport: RoadmapViewport) => void;
  onFlowInit: (instance: RoadmapFlowInstance | null) => void;
  onAddAction: (id: AddNodeActionId, placement: NodePlacement) => void;
  onDropFiles: (placement: NodePlacement, dataTransfer: DataTransfer | null) => void;
  onDeleteElements: (nodeIds: string[], edgeIds: string[]) => void;
}

/**
 * Props of the canvas. Callbacks are grouped by concern into stable objects (`nodeActions`,
 * `edgeActions`, …) so the surface stays narrow. The `*Nonce` fields are bump-to-trigger
 * signals: open the find/filter bars, clear the selection, or re-select `focusIds` after paste.
 */
interface RoadmapCanvasProps {
  state: RoadmapState;
  locked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  initialDotsVisible: boolean;
  initialMiniMapVisible: boolean;
  initialAddBarVisible: boolean;
  initialProgressVisible: boolean;
  initialProgressInCorner: boolean;
  initialProgressCompact: boolean;
  initialCompactControls: boolean;
  openSearchNonce: number;
  openFilterNonce: number;
  clearSelectionNonce: number;
  focusIds: string[];
  focusNonce: number;
  isNodeMissing: NodeMissingPredicate;
  resolveImageSrc: NodeImageResolver;
  resolveFileInfo: NodeFileInfoResolver;
  nodeActions: CanvasNodeActions;
  edgeActions: CanvasEdgeActions;
  clusterActions: CanvasClusterActions;
  boardActions: CanvasBoardActions;
  menuActions: CanvasMenuActions;
  palette: readonly string[];
}

export function RoadmapCanvas({
  state,
  locked,
  canUndo,
  canRedo,
  initialDotsVisible,
  initialMiniMapVisible,
  initialAddBarVisible,
  initialProgressVisible,
  initialProgressInCorner,
  initialProgressCompact,
  initialCompactControls,
  openSearchNonce,
  openFilterNonce,
  clearSelectionNonce,
  focusIds,
  focusNonce,
  isNodeMissing,
  resolveImageSrc,
  resolveFileInfo,
  nodeActions,
  edgeActions,
  clusterActions,
  boardActions,
  menuActions,
  palette,
}: RoadmapCanvasProps) {
  const {
    onMoved: onNodesMoved,
    onReparent: onNodesReparent,
    onDuplicate: onNodesDuplicate,
    onResized: onNodeResized,
    onOpen: onNodeOpen,
    onPreview: onNodePreview,
    onSelectionChange,
  } = nodeActions;
  const { onConnect: onConnectNodes, onReconnect: onReconnectEdge, onReconnectToEmpty } = edgeActions;
  const { onToggleCollapse: onClusterToggleCollapse, onArrange: onClusterArrange } = clusterActions;
  const {
    onUndo,
    onRedo,
    onToggleLock,
    onAutoLayout,
    onExportPdf,
    onExportPng,
    onExportCanvas,
    onOpenSettings,
    onDotsVisibleChange,
    onMiniMapVisibleChange,
    onAddBarVisibleChange,
    onProgressVisibleChange,
    onProgressCornerChange,
    onProgressCompactChange,
    onCompactControlsChange,
    onViewportChange,
    onFlowInit,
    onAddAction,
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
  const [addBarVisible, setAddBarVisible] = useState(initialAddBarVisible);
  const [progressVisible, setProgressVisible] = useState(initialProgressVisible);
  const [progressInCorner, setProgressInCorner] = useState(initialProgressInCorner);
  const [progressCompact, setProgressCompact] = useState(initialProgressCompact);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [compactControls, setCompactControls] = useState(initialCompactControls);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<ReadonlySet<string>>(() => new Set());
  const [filterPriorities, setFilterPriorities] = useState<ReadonlySet<string>>(() => new Set());
  const initialViewportRef = useRef(state.viewport);
  const [nodes, setNodes] = useState<RoadmapFlowNode[]>(() =>
    stateToFlowNodes(state, isNodeMissing, resolveImageSrc, resolveFileInfo),
  );
  const [edges, setEdges] = useState<RoadmapFlowEdge[]>(() => stateToFlowEdges(state));
  const progress = boardProgress(state);
  const [dragging, setDragging] = useState(false);
  const [cardMenu, setCardMenu] = useState<
    | ({ flow: NodePlacement } & (
        | { kind: "pane" }
        | { kind: "void"; source: string; handle: string | null }
        | { kind: "selection"; ids: string[] }
      ))
    | null
  >(null);
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
    setNodes((current) =>
      reconcileFlowNodes(current, stateToFlowNodes(state, isNodeMissing, resolveImageSrc, resolveFileInfo)),
    );
    setEdges((current) => reconcileFlowEdges(current, stateToFlowEdges(state)));
  }, [state, isNodeMissing, resolveImageSrc, resolveFileInfo]);

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

  useEffect(() => {
    if (clearSelectionNonce === 0) {
      return;
    }

    setNodes((current) => current.map((node) => (node.selected === true ? { ...node, selected: false } : node)));
    setEdges((current) => current.map((edge) => (edge.selected === true ? { ...edge, selected: false } : edge)));
  }, [clearSelectionNonce]);

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

  /** Applies the new endpoints optimistically to avoid a one-frame flash of the old edge. A reconnect
   * the session rejects commits no state, so nothing would undo the optimistic change; a deferred
   * re-sync then restores the edges from the latest state. */
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

      setCardMenu({ kind: "void", source: fromNodeId, handle: connection.fromHandle?.id ?? null, flow: point });
    },
    [screenToFlowPosition, nodeAtPoint, onReconnectToEmpty],
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
   * Commits the alt-drag copies at their final positions and pins the originals back to their
   * pre-drag spots; the temp copies stay until the committed state swaps them for the real
   * duplicates. Returns false when no alt-drag is active.
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
      setDragging(true);

      if ("altKey" in event && event.altKey) {
        startAltDuplicate(dragged);
      }
    },
    [startAltDuplicate],
  );

  const onSelectionDragStart = useCallback(
    (event: ReactMouseEvent, dragged: RoadmapFlowNode[]) => {
      setDragging(true);

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
      setDragging(false);

      if (!finalizeAltDuplicate()) {
        commitDrag(dragged);
      }
    },
    [finalizeAltDuplicate, commitDrag],
  );

  const onSelectionDragStop = useCallback(
    (_event: ReactMouseEvent, dragged: RoadmapFlowNode[]) => {
      setDragging(false);

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

  /** Right-click selects its target; the bubble toolbar follows the selection. */
  const selectOnly = useCallback((id: string, kind: "node" | "edge") => {
    setNodes((current) => current.map((node) => ({ ...node, selected: kind === "node" && node.id === id })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: kind === "edge" && edge.id === id })));
  }, []);

  const onEdgeContextMenuInternal = useCallback(
    (event: ReactMouseEvent, edge: RoadmapFlowEdge) => {
      event.preventDefault();

      if (!locked) {
        selectOnly(edge.id, "edge");
      }
    },
    [locked, selectOnly],
  );

  const onNodeContextMenuInternal = useCallback(
    (event: ReactMouseEvent, node: RoadmapFlowNode) => {
      event.preventDefault();

      if (locked) {
        return;
      }

      const selectedIds = getNodes()
        .filter((candidate) => candidate.selected === true)
        .map((candidate) => candidate.id);

      if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
        setCardMenu({
          kind: "selection",
          ids: selectedIds,
          flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        });

        return;
      }

      selectOnly(node.id, "node");
    },
    [locked, selectOnly, getNodes, screenToFlowPosition],
  );

  const onSelectionContextMenuInternal = useCallback(
    (event: ReactMouseEvent, selected: RoadmapFlowNode[]) => {
      event.preventDefault();

      if (!locked) {
        setCardMenu({
          kind: "selection",
          ids: selected.map((node) => node.id),
          flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        });
      }
    },
    [locked, screenToFlowPosition],
  );

  const onPaneContextMenuInternal = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault();
      const native = "nativeEvent" in event ? event.nativeEvent : event;

      if (!locked) {
        setCardMenu({ kind: "pane", flow: screenToFlowPosition({ x: native.clientX, y: native.clientY }) });
      }
    },
    [locked, screenToFlowPosition],
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

  const toggleAddBar = useCallback(() => {
    const next = !addBarVisible;

    setAddBarVisible(next);
    onAddBarVisibleChange(next);
  }, [addBarVisible, onAddBarVisibleChange]);

  const toggleProgress = useCallback(() => {
    const next = !progressVisible;

    setProgressVisible(next);
    onProgressVisibleChange(next);
  }, [progressVisible, onProgressVisibleChange]);

  const toggleProgressExpanded = useCallback(() => {
    setProgressExpanded((value) => !value);
  }, []);

  const toggleProgressCorner = useCallback(() => {
    const next = !progressInCorner;

    setProgressInCorner(next);
    onProgressCornerChange(next);
  }, [progressInCorner, onProgressCornerChange]);

  const toggleProgressCompact = useCallback(() => {
    const next = !progressCompact;

    setProgressCompact(next);
    onProgressCompactChange(next);
  }, [progressCompact, onProgressCompactChange]);

  const toggleCompactControls = useCallback(() => {
    const next = !compactControls;

    setCompactControls(next);
    onCompactControlsChange(next);
  }, [compactControls, onCompactControlsChange]);

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
  const filterState = useMemo(() => ({ dimmed: dimPredicate, active: filterActive }), [dimPredicate, filterActive]);

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

  const selectedNodes = nodes.filter((node) => node.selected === true);
  const selectedEdges = edges.filter((edge) => edge.selected === true);
  const soleNode = selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes[0] : null;
  const soleEdge = selectedEdges.length === 1 && selectedNodes.length === 0 ? selectedEdges[0] : null;
  const bubblesVisible = !locked && !dragging && cardMenu === null;

  return (
    <NodeCallbacksContext.Provider value={nodeCallbacks}>
      <NodeFilterContext.Provider value={filterState}>
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
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            fitViewOptions={{ padding: FIT_VIEW_PADDING }}
            defaultViewport={initialViewportRef.current}
            fitView={initialViewportRef.current === undefined}
          >
            {dotsVisible ? (
              <Background variant={BackgroundVariant.Dots} gap={BACKGROUND_DOT_GAP} size={BACKGROUND_DOT_SIZE} />
            ) : null}
            {miniMapVisible ? (
              <MiniMap
                className="rm-minimap"
                position="bottom-left"
                ariaLabel="Mini-map"
                pannable
                zoomable
                nodeColor={miniMapNodeColor}
                nodeBorderRadius={MINIMAP_NODE_RADIUS}
                maskColor="var(--rm-minimap-mask)"
              />
            ) : null}
            {progressVisible && !(!progressInCorner && (searchOpen || filterOpen)) ? (
              <ProgressIsland
                progress={progress}
                inCorner={progressInCorner}
                compact={progressCompact}
                expanded={progressExpanded}
                onToggleExpanded={toggleProgressExpanded}
              />
            ) : null}
            <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
            {bubblesVisible && soleNode !== null ? (
              <FlowNodeToolbar nodeId={soleNode.id} isVisible position={Position.Top} offset={12}>
                {isCardNode(soleNode) ? (
                  <NodeBubble
                    node={soleNode}
                    selectionIds={selectedNodes.map((node) => node.id)}
                    palette={palette}
                    actions={menuActions}
                  />
                ) : (
                  <ClusterBubble cluster={soleNode} palette={palette} actions={menuActions} />
                )}
              </FlowNodeToolbar>
            ) : null}
            {bubblesVisible && soleEdge !== null ? (
              <EdgeBubbleAnchor edge={soleEdge}>
                <EdgeBubble edge={soleEdge} palette={palette} actions={menuActions} />
              </EdgeBubbleAnchor>
            ) : null}
            {addBarVisible && !locked ? <NodeToolbar onAction={onAddAction} /> : null}
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
              compact={compactControls}
              onToggleCompact={toggleCompactControls}
              dotsVisible={dotsVisible}
              onToggleDots={toggleDots}
              miniMapVisible={miniMapVisible}
              onToggleMiniMap={toggleMiniMap}
              addBarVisible={addBarVisible}
              onToggleAddBar={toggleAddBar}
              progressVisible={progressVisible}
              onToggleProgress={toggleProgress}
              progressInCorner={progressInCorner}
              onToggleProgressCorner={toggleProgressCorner}
              progressCompact={progressCompact}
              onToggleProgressCompact={toggleProgressCompact}
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
              onExportPng={onExportPng}
              onExportCanvas={onExportCanvas}
              onOpenSettings={onOpenSettings}
            />
          </ReactFlow>
          {cardMenu !== null && !locked ? (
            <FlowAnchor point={cardMenu.flow}>
              <CardMenu
                title={
                  cardMenu.kind === "pane"
                    ? "Add to canvas"
                    : cardMenu.kind === "void"
                      ? "Connect to new node"
                      : `${cardMenu.ids.length} nodes selected`
                }
                narrow={cardMenu.kind !== "selection"}
                onClose={() => setCardMenu(null)}
              >
                {cardMenu.kind === "selection" ? (
                  <SelectionCard
                    ids={cardMenu.ids}
                    nodes={nodes.filter(
                      (node): node is RoadmapCardNode => cardMenu.ids.includes(node.id) && isCardNode(node),
                    )}
                    palette={palette}
                    actions={menuActions}
                    onClose={() => setCardMenu(null)}
                  />
                ) : (
                  <AddActionRows
                    onPick={(action) => {
                      const menu = cardMenu;

                      setCardMenu(null);

                      if (menu.kind === "pane") {
                        menuActions.addNodeAt(action, menu.flow);
                      } else if (menu.kind === "void") {
                        menuActions.connectNewNode(action, menu.source, menu.handle, menu.flow);
                      }
                    }}
                  />
                )}
              </CardMenu>
            </FlowAnchor>
          ) : null}
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
