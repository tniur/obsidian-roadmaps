import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from "../constants";
import type { RoadmapNodeData } from "./flow";
import { Icon } from "./Icon";
import { useNodeCallbacks } from "./nodeCallbacks";
import { getNodeRenderer } from "./nodeRegistry";

const HANDLE_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function RoadmapNodeView({ id, data, selected }: NodeProps) {
  const node = data as RoadmapNodeData;
  const Body = getNodeRenderer(node.kind);
  const callbacks = useNodeCallbacks();
  const align = node.align ?? { h: "left", v: "middle" };
  const colorStyle = node.color !== undefined ? ({ "--rm-node-color": node.color } as CSSProperties) : undefined;

  return (
    <>
      <div
        className="rm-node"
        data-selected={selected === true}
        data-missing={node.missing === true}
        data-colored={node.color !== undefined}
        data-align-h={align.h}
        data-align-v={align.v}
        style={colorStyle}
      >
        {node.missing === true ? (
          <span className="rm-node__broken" aria-label="Source file is missing" title="Source file is missing">
            <Icon name="alert-triangle" />
          </span>
        ) : null}
        {Body !== null ? <Body data={node} /> : <span className="rm-node__title">{node.label}</span>}
      </div>
      <NodeResizer
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        isVisible={selected === true && callbacks?.locked !== true}
        onResizeEnd={(_event, params) => {
          callbacks?.onResizeEnd(id, params.width, params.height, params.x, params.y);
        }}
      />
      {HANDLE_SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className="rm-handle" />
      ))}
    </>
  );
}
