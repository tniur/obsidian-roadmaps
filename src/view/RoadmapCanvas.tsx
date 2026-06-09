import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
import { useCallback, useId, useState } from "react";
import { RoadmapToolbar } from "./RoadmapToolbar";

interface RoadmapCanvasProps {
  initialDotsVisible: boolean;
  onDotsVisibleChange: (value: boolean) => void;
}

export function RoadmapCanvas({ initialDotsVisible, onDotsVisibleChange }: RoadmapCanvasProps) {
  const flowId = useId();
  const [dotsVisible, setDotsVisible] = useState(initialDotsVisible);

  const toggleDots = useCallback(() => {
    const next = !dotsVisible;
    setDotsVisible(next);
    onDotsVisibleChange(next);
  }, [dotsVisible, onDotsVisibleChange]);

  return (
    <div className="rm-canvas">
      <ReactFlow
        id={flowId}
        defaultNodes={[]}
        defaultEdges={[]}
        proOptions={{ hideAttribution: true }}
      >
        {dotsVisible ? <Background variant={BackgroundVariant.Dots} /> : null}
        <RoadmapToolbar dotsVisible={dotsVisible} onToggleDots={toggleDots} />
      </ReactFlow>
    </div>
  );
}
