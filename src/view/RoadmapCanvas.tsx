import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
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
  onNodeMoved: (id: string, x: number, y: number) => void;
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
  onNodeMoved,
  onNodeOpen,
  onCreateNote,
  onAddNote,
  onDropFiles,
  onNodesDelete,
  onConnectNodes,
  onEdgesDelete,
  onEdgeContextMenu,
}: RoadmapCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const flowId = useId();
  const [dotsVisible, setDotsVisible] = useState(initialDotsVisible);
  const [nodes, setNodes] = useState<RoadmapFlowNode[]>(() => stateToFlowNodes(state));
  const [edges, setEdges] = useState<Edge[]>(() => stateToFlowEdges(state));

  useEffect(() => {
    setNodes((current) => reconcileFlowNodes(current, stateToFlowNodes(state)));
    setEdges(stateToFlowEdges(state));
  }, [state]);

  const onNodesChange = useCallback((changes: NodeChange<RoadmapFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

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

  const onNodeDragStop = useCallback(
    (_event: unknown, node: RoadmapFlowNode) => {
      onNodeMoved(node.id, node.position.x, node.position.y);
    },
    [onNodeMoved],
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
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeContextMenu={onEdgeContextMenuInternal}
        onNodesDelete={onNodesDeleteInternal}
        onEdgesDelete={onEdgesDeleteInternal}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        {dotsVisible ? <Background variant={BackgroundVariant.Dots} /> : null}
        <NodeToolbar onCreateNote={onCreateNote} onAddNote={onAddNote} />
        <RoadmapToolbar dotsVisible={dotsVisible} onToggleDots={toggleDots} />
      </ReactFlow>
    </div>
  );
}
