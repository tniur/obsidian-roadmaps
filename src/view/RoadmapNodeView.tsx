import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { RoadmapNodeData } from "./flow";
import { getNodeRenderer } from "./nodeRegistry";

const HANDLE_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function RoadmapNodeView({ data, selected }: NodeProps) {
  const node = data as RoadmapNodeData;
  const Body = getNodeRenderer(node.kind);

  return (
    <div className="rm-node" data-selected={selected === true}>
      {HANDLE_SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className="rm-handle" />
      ))}
      {Body !== null ? <Body data={node} /> : <span className="rm-node__title">{node.label}</span>}
    </div>
  );
}
