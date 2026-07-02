import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
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
import { ClusterNodeView } from "./ClusterNodeView";
import { FloatingEdge } from "./FloatingEdge";
import { getHelperLines } from "./alignment";
import { HelperLines } from "./HelperLines";
import { NodeCallbacksContext, type NodeCallbacks } from "./nodeCallbacks";
import {
  reconcileFlowNodes,
  ROADMAP_CLUSTER_TYPE,
  ROADMAP_EDGE_TYPE,
  ROADMAP_NODE_TYPE,
  stateToFlowEdges,
  stateToFlowNodes,
  type NodeImageResolver,
  type NodeMissingPredicate,
  type RoadmapFlowNode,
} from "./flow";
import { NodeToolbar } from "./NodeToolbar";
import { RoadmapNodeView } from "./RoadmapNodeView";
import { RoadmapToolbar } from "./RoadmapToolbar";

const nodeTypes = {
  [ROADMAP_NODE_TYPE]: RoadmapNodeView,
  [ROADMAP_CLUSTER_TYPE]: ClusterNodeView,
};

const edgeTypes = { [ROADMAP_EDGE_TYPE]: FloatingEdge };

function clientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }

  const touch = event.changedTouches[0];

  return touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
}

interface RoadmapCanvasProps {
  state: RoadmapState;
  isNodeMissing: NodeMissingPredicate;
  resolveImageSrc: NodeImageResolver;
  initialDotsVisible: boolean;
  onDotsVisibleChange: (value: boolean) => void;
  locked: boolean;
  onToggleLock: () => void;
  onViewportChange: (viewport: RoadmapViewport) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  focusIds: string[];
  focusNonce: number;
  onNodesMoved: (moves: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  onNodesReparent: (items: ReadonlyArray<{ id: string; clusterId: string | null; x: number; y: number }>) => void;
  onNodesDuplicate: (items: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  onNodeResized: (id: string, width: number, height: number, x: number, y: number) => void;
  onClusterToggleCollapse: (id: string) => void;
  onClusterArrange: (id: string) => void;
  onNodeOpen: (id: string, newLeaf: boolean) => void;
  onNodePreview: (id: string) => void;
  onSelectionChange: (ids: string[]) => void;
  onCreateNote: (placement: NodePlacement) => void;
  onAddNote: (placement: NodePlacement) => void;
  onAddUrl: (placement: NodePlacement) => void;
  onAddImage: (placement: NodePlacement) => void;
  onAddText: (placement: NodePlacement) => void;
  onAddAttachment: (placement: NodePlacement) => void;
  onCreateNodeAt: (placement: NodePlacement, event: MouseEvent) => void;
  onDropFiles: (placement: NodePlacement, dataTransfer: DataTransfer | null) => void;
  onDeleteElements: (nodeIds: string[], edgeIds: string[]) => void;
  onConnectNodes: (source: string, target: string, sourceHandle: string | null, targetHandle: string | null) => void;
  onReconnectEdge: (id: string, connection: Connection) => void;
  onConnectToEmpty: (source: string, sourceHandle: string | null, placement: NodePlacement, event: MouseEvent) => void;
  onEdgeContextMenu: (id: string, event: MouseEvent) => void;
  onNodeContextMenu: (id: string, event: MouseEvent) => void;
  onSelectionContextMenu: (ids: string[], event: MouseEvent) => void;
}

export function RoadmapCanvas({
  state,
  isNodeMissing,
  resolveImageSrc,
  initialDotsVisible,
  onDotsVisibleChange,
  locked,
  onToggleLock,
  onViewportChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  focusIds,
  focusNonce,
  onNodesMoved,
  onNodesReparent,
  onNodesDuplicate,
  onNodeResized,
  onClusterToggleCollapse,
  onClusterArrange,
  onNodeOpen,
  onNodePreview,
  onSelectionChange,
  onCreateNote,
  onAddNote,
  onAddUrl,
  onAddImage,
  onAddText,
  onAddAttachment,
  onCreateNodeAt,
  onDropFiles,
  onDeleteElements,
  onConnectNodes,
  onReconnectEdge,
  onConnectToEmpty,
  onEdgeContextMenu,
  onNodeContextMenu,
  onSelectionContextMenu,
}: RoadmapCanvasProps) {
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const flowId = useId();
  const [dotsVisible, setDotsVisible] = useState(initialDotsVisible);
  const initialViewportRef = useRef(state.viewport);
  const [nodes, setNodes] = useState<RoadmapFlowNode[]>(() => stateToFlowNodes(state, isNodeMissing, resolveImageSrc));
  const [edges, setEdges] = useState<Edge[]>(() => stateToFlowEdges(state));
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({});
  const altDragRef = useRef<{
    map: Map<string, string>;
    frozen: Map<string, { x: number; y: number }>;
  } | null>(null);

  useEffect(() => {
    setNodes((current) => reconcileFlowNodes(current, stateToFlowNodes(state, isNodeMissing, resolveImageSrc)));
    setEdges(stateToFlowEdges(state));
  }, [state, isNodeMissing, resolveImageSrc]);

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

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
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
    (oldEdge: Edge, connection: Connection) => {
      onReconnectEdge(oldEdge.id, connection);
    },
    [onReconnectEdge],
  );

  const nodeAtPoint = useCallback(
    (point: { x: number; y: number }): boolean => {
      return getNodes().some((node) => {
        const w = node.measured?.width ?? node.width ?? 0;
        const h = node.measured?.height ?? node.height ?? 0;

        return (
          point.x >= node.position.x &&
          point.x <= node.position.x + w &&
          point.y >= node.position.y &&
          point.y <= node.position.y + h
        );
      });
    },
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

      const copyId = `dup-${nanoid()}`;

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
        const parent = copy.parentId == null ? undefined : all.find((node) => node.id === copy.parentId);

        items.push({
          id: originalId,
          x: (parent?.position.x ?? 0) + copy.position.x,
          y: (parent?.position.y ?? 0) + copy.position.y,
        });
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
      const cluster = getNodes().find((node) => {
        if (node.type !== ROADMAP_CLUSTER_TYPE) {
          return false;
        }

        const w = node.measured?.width ?? node.width ?? 0;
        const h = node.measured?.height ?? node.height ?? 0;

        return (
          point.x >= node.position.x &&
          point.x <= node.position.x + w &&
          point.y >= node.position.y &&
          point.y <= node.position.y + h
        );
      });

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

        const parent = node.parentId == null ? undefined : getNodes().find((n) => n.id === node.parentId);
        const absX = (parent?.position.x ?? 0) + node.position.x;
        const absY = (parent?.position.y ?? 0) + node.position.y;
        const w = node.measured?.width ?? node.width ?? 0;
        const h = node.measured?.height ?? node.height ?? 0;
        const target = clusterAtPoint({ x: absX + w / 2, y: absY + h / 2 });

        if (target !== (node.parentId ?? null)) {
          reparents.push({ id: node.id, clusterId: target, x: absX, y: absY });
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
    (event: ReactMouseEvent, edge: Edge) => {
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

      onCreateNodeAt(placement, native);
    },
    [screenToFlowPosition, onCreateNodeAt],
  );

  const onDeleteInternal = useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }: { nodes: RoadmapFlowNode[]; edges: Edge[] }) => {
      onDeleteElements(
        deletedNodes.map((node) => node.id),
        deletedEdges.map((edge) => edge.id),
      );
    },
    [onDeleteElements],
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
      <div className="rm-canvas" onDragOver={onDragOver} onDrop={onDrop}>
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
          proOptions={{ hideAttribution: true }}
          defaultViewport={initialViewportRef.current}
          fitView={initialViewportRef.current === undefined}
        >
          {dotsVisible ? <Background variant={BackgroundVariant.Dots} /> : null}
          <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
          {!locked ? (
            <NodeToolbar
              onCreateNote={onCreateNote}
              onAddNote={onAddNote}
              onAddUrl={onAddUrl}
              onAddImage={onAddImage}
              onAddText={onAddText}
              onAddAttachment={onAddAttachment}
            />
          ) : null}
          <RoadmapToolbar
            dotsVisible={dotsVisible}
            onToggleDots={toggleDots}
            locked={locked}
            onToggleLock={onToggleLock}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        </ReactFlow>
      </div>
    </NodeCallbacksContext.Provider>
  );
}
