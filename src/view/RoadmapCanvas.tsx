import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
  type NodeChange,
} from "@xyflow/react";
import { type DragEvent, type MouseEvent, useCallback, useEffect, useId, useState } from "react";
import type { NodePlacement } from "../domain/create";
import type { RoadmapState } from "../domain/types";
import {
  reconcileFlowNodes,
  ROADMAP_NODE_TYPE,
  stateToFlowNodes,
  type RoadmapFlowNode,
} from "./flow";
import { NodeToolbar } from "./NodeToolbar";
import { RoadmapNodeView } from "./RoadmapNodeView";
import { RoadmapToolbar } from "./RoadmapToolbar";

const nodeTypes = { [ROADMAP_NODE_TYPE]: RoadmapNodeView };

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
}: RoadmapCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const flowId = useId();
  const [dotsVisible, setDotsVisible] = useState(initialDotsVisible);
  const [nodes, setNodes] = useState<RoadmapFlowNode[]>(() => stateToFlowNodes(state));

  useEffect(() => {
    setNodes((current) => reconcileFlowNodes(current, stateToFlowNodes(state)));
  }, [state]);

  const onNodesChange = useCallback((changes: NodeChange<RoadmapFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onNodeDragStop = useCallback(
    (_event: unknown, node: RoadmapFlowNode) => {
      onNodeMoved(node.id, node.position.x, node.position.y);
    },
    [onNodeMoved],
  );

  const onNodeDoubleClick = useCallback(
    (event: MouseEvent, node: RoadmapFlowNode) => {
      onNodeOpen(node.id, event.ctrlKey || event.metaKey);
    },
    [onNodeOpen],
  );

  const onNodesDeleteInternal = useCallback(
    (deleted: RoadmapFlowNode[]) => {
      onNodesDelete(deleted.map((node) => node.id));
    },
    [onNodesDelete],
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
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodesDelete={onNodesDeleteInternal}
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
