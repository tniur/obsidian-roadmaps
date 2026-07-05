import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStore,
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
import type { NodePlacement } from "../domain/create";
import type { RoadmapState, RoadmapViewport } from "../domain/types";
import type { AddNodeActionId } from "./addNodeActions";
import { ClusterNodeView } from "./ClusterNodeView";
import { FloatingEdge } from "./FloatingEdge";
import { getHelperLines } from "./alignment";
import { HelperLines } from "./HelperLines";
import { NodeCallbacksContext, type NodeCallbacks } from "./nodeCallbacks";
import {
  absoluteNodePosition,
  nodeContainsPoint,
  nodeSize,
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
import { NodeToolbar } from "./NodeToolbar";
import { RoadmapNodeView } from "./RoadmapNodeView";
import { RoadmapToolbar } from "./RoadmapToolbar";

const nodeTypes = {
  [ROADMAP_NODE_TYPE]: RoadmapNodeView,
  [ROADMAP_CLUSTER_TYPE]: ClusterNodeView,
};

const edgeTypes = { [ROADMAP_EDGE_TYPE]: FloatingEdge };

/** Ephemeral ids for alt-drag copies; the copies are replaced by real nodes on drop. */
const ALT_COPY_ID_PREFIX = "dup-";

const DOUBLE_CLICK_ZOOM_FACTOR = 2;

const DOUBLE_CLICK_ZOOM_DURATION = 200;

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
  onExportPdf: () => void;
  onDotsVisibleChange: (value: boolean) => void;
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
  /** Bumping `focusNonce` re-selects exactly `focusIds` (paste and duplicate flows). */
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
    onContextMenu: onEdgeContextMenu,
  } = edgeActions;
  const { onToggleCollapse: onClusterToggleCollapse, onArrange: onClusterArrange } = clusterActions;
  const {
    onUndo,
    onRedo,
    onToggleLock,
    onExportPdf,
    onDotsVisibleChange,
    onViewportChange,
    onFlowInit,
    onAddAction,
    onPaneContextMenu,
    onDropFiles,
    onDeleteElements,
  } = boardActions;
  const reactFlow = useReactFlow<RoadmapFlowNode, RoadmapFlowEdge>();
  const { screenToFlowPosition, getNodes, getViewport, setViewport } = reactFlow;
  const minZoom = useStore((store) => store.minZoom);
  const maxZoom = useStore((store) => store.maxZoom);
  const flowId = useId();
  const [dotsVisible, setDotsVisible] = useState(initialDotsVisible);
  const initialViewportRef = useRef(state.viewport);
  const [nodes, setNodes] = useState<RoadmapFlowNode[]>(() => stateToFlowNodes(state, isNodeMissing, resolveImageSrc));
  const [edges, setEdges] = useState<RoadmapFlowEdge[]>(() => stateToFlowEdges(state));
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({});
  const altDragRef = useRef<{
    map: Map<string, string>;
    frozen: Map<string, { x: number; y: number }>;
  } | null>(null);

  useEffect(() => {
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

    setNodes((current) => current.map((node) => ({ ...node, selected: focusIds.includes(node.id) })));
  }, [focusNonce, focusIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange<RoadmapFlowNode>[]) => {
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

        setNodes((current) => applyNodeChanges(augmented, current));

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
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [getNodes],
  );

  const onEdgesChange = useCallback((changes: EdgeChange<RoadmapFlowEdge>[]) => {
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

  const onReconnect = useCallback(
    (oldEdge: RoadmapFlowEdge, connection: Connection) => {
      onReconnectEdge(oldEdge.id, connection);
    },
    [onReconnectEdge],
  );

  const nodeAtPoint = useCallback(
    (point: { x: number; y: number }): boolean => getNodes().some((node) => nodeContainsPoint(node, point)),
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

      onConnectToEmpty(fromNodeId, connection.fromHandle?.id ?? null, point, event as MouseEvent);
    },
    [screenToFlowPosition, nodeAtPoint, onConnectToEmpty],
  );

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
      copies.push({ ...node, id: copyId, selected: false, dragging: true });
    }

    if (copies.length === 0) {
      return;
    }

    altDragRef.current = { map, frozen };
    setNodes((current) => [...current, ...copies]);
  }, []);

  const finalizeAltDuplicate = useCallback((): boolean => {
    const alt = altDragRef.current;

    if (alt === null) {
      return false;
    }

    altDragRef.current = null;
    const all = getNodes();
    const items: { id: string; x: number; y: number }[] = [];

    for (const [originalId, copyId] of alt.map) {
      const copy = all.find((node) => node.id === copyId);

      if (copy !== undefined) {
        const absolute = absoluteNodePosition(copy, all);

        items.push({ id: originalId, x: absolute.x, y: absolute.y });
      }
    }

    onNodesDuplicate(items);

    return true;
  }, [getNodes, onNodesDuplicate]);

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
      const cluster = getNodes().find((node) => node.type === ROADMAP_CLUSTER_TYPE && nodeContainsPoint(node, point));

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

  const onDeleteInternal = useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }: { nodes: RoadmapFlowNode[]; edges: RoadmapFlowEdge[] }) => {
      onDeleteElements(
        deletedNodes.map((node) => node.id),
        deletedEdges.map((edge) => edge.id),
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
        target.closest(".react-flow__node, .react-flow__edge, .react-flow__panel") !== null ||
        target.closest(".react-flow__pane") === null
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
          <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
          {!locked ? <NodeToolbar onAction={onAddAction} /> : null}
          <RoadmapToolbar
            dotsVisible={dotsVisible}
            onToggleDots={toggleDots}
            locked={locked}
            onToggleLock={onToggleLock}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
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
    </NodeCallbacksContext.Provider>
  );
}
