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
  type NodeChange,
} from "@xyflow/react";
import {
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import type { NodePlacement } from "../domain/create";
import type { RoadmapState } from "../domain/types";
import { FloatingEdge } from "./FloatingEdge";
import { getHelperLines } from "./alignment";
import { HelperLines } from "./HelperLines";
import {
  reconcileFlowNodes,
  ROADMAP_EDGE_TYPE,
  ROADMAP_NODE_TYPE,
  stateToFlowEdges,
  stateToFlowNodes,
  type RoadmapFlowNode,
} from "./flow";
import { NodeToolbar } from "./NodeToolbar";
import { RoadmapNodeView } from "./RoadmapNodeView";
import { RoadmapToolbar } from "./RoadmapToolbar";

const nodeTypes = { [ROADMAP_NODE_TYPE]: RoadmapNodeView };

const edgeTypes = { [ROADMAP_EDGE_TYPE]: FloatingEdge };

interface RoadmapCanvasProps {
  state: RoadmapState;
  initialDotsVisible: boolean;
  onDotsVisibleChange: (value: boolean) => void;
  onNodesMoved: (moves: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  onNodeOpen: (id: string, newLeaf: boolean) => void;
  onCreateNote: (placement: NodePlacement) => void;
  onAddNote: (placement: NodePlacement) => void;
  onDropFiles: (placement: NodePlacement, dataTransfer: DataTransfer | null) => void;
  onNodesDelete: (ids: string[]) => void;
  onConnectNodes: (
    source: string,
    target: string,
    sourceHandle: string | null,
    targetHandle: string | null,
  ) => void;
  onEdgesDelete: (ids: string[]) => void;
  onEdgeContextMenu: (id: string, event: MouseEvent) => void;
}

export function RoadmapCanvas({
  state,
  initialDotsVisible,
  onDotsVisibleChange,
  onNodesMoved,
  onNodeOpen,
  onCreateNote,
  onAddNote,
  onDropFiles,
  onNodesDelete,
  onConnectNodes,
  onEdgesDelete,
  onEdgeContextMenu,
}: RoadmapCanvasProps) {
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const flowId = useId();
  const [dotsVisible, setDotsVisible] = useState(initialDotsVisible);
  const [nodes, setNodes] = useState<RoadmapFlowNode[]>(() => stateToFlowNodes(state));
  const [edges, setEdges] = useState<Edge[]>(() => stateToFlowEdges(state));
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({});

  useEffect(() => {
    setNodes((current) => reconcileFlowNodes(current, stateToFlowNodes(state)));
    setEdges(stateToFlowEdges(state));
  }, [state]);

  const onNodesChange = useCallback(
    (changes: NodeChange<RoadmapFlowNode>[]) => {
      let lines: { horizontal?: number; vertical?: number } = {};
      const [first] = changes;
      if (
        changes.length === 1 &&
        first?.type === "position" &&
        first.dragging === true &&
        first.position !== undefined
      ) {
        const result = getHelperLines(first, getNodes());
        if (result.snapX !== undefined) {
          first.position.x = result.snapX;
        }
        if (result.snapY !== undefined) {
          first.position.y = result.snapY;
        }
        lines = { horizontal: result.horizontal, vertical: result.vertical };
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

  const persistMoves = useCallback(
    (dragged: RoadmapFlowNode[]) => {
      onNodesMoved(
        dragged.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
      );
    },
    [onNodesMoved],
  );

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: RoadmapFlowNode, dragged: RoadmapFlowNode[]) => {
      persistMoves(dragged);
    },
    [persistMoves],
  );

  const onSelectionDragStop = useCallback(
    (_event: ReactMouseEvent, dragged: RoadmapFlowNode[]) => {
      persistMoves(dragged);
    },
    [persistMoves],
  );

  const onNodeDoubleClick = useCallback(
    (event: ReactMouseEvent, node: RoadmapFlowNode) => {
      onNodeOpen(node.id, event.ctrlKey || event.metaKey);
    },
    [onNodeOpen],
  );

  const onEdgeContextMenuInternal = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      event.preventDefault();
      onEdgeContextMenu(edge.id, event.nativeEvent);
    },
    [onEdgeContextMenu],
  );

  const onNodesDeleteInternal = useCallback(
    (deleted: RoadmapFlowNode[]) => {
      onNodesDelete(deleted.map((node) => node.id));
    },
    [onNodesDelete],
  );

  const onEdgesDeleteInternal = useCallback(
    (deleted: Edge[]) => {
      onEdgesDelete(deleted.map((edge) => edge.id));
    },
    [onEdgesDelete],
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

  return (
    <div className="rm-canvas" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        id={flowId}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onSelectionDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeContextMenu={onEdgeContextMenuInternal}
        onNodesDelete={onNodesDeleteInternal}
        onEdgesDelete={onEdgesDeleteInternal}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        selectionKeyCode={null}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        panOnScroll
        proOptions={{ hideAttribution: true }}
        fitView
      >
        {dotsVisible ? <Background variant={BackgroundVariant.Dots} /> : null}
        <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
        <NodeToolbar onCreateNote={onCreateNote} onAddNote={onAddNote} />
        <RoadmapToolbar dotsVisible={dotsVisible} onToggleDots={toggleDots} />
      </ReactFlow>
    </div>
  );
}
