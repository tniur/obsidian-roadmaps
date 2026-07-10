import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from "../constants";
import type { RoadmapCardNode } from "./flow";
import { Icon } from "./Icon";
import { useNodeCallbacks } from "./nodeCallbacks";
import { useNodeDimmed } from "./nodeFilterContext";
import { NodeHandles } from "./NodeHandles";
import { getNodeRenderer } from "./nodeRegistry";

export function RoadmapNodeView({ id, data, selected, isConnectable }: NodeProps<RoadmapCardNode>) {
  const node = data;
  const Body = getNodeRenderer(node.kind);
  const callbacks = useNodeCallbacks();
  const dimmed = useNodeDimmed()(node.status, node.priority);
  const align = node.align ?? { h: "left", v: "middle" };
  const colorStyle = node.color !== undefined ? ({ "--rm-node-color": node.color } as CSSProperties) : undefined;

  return (
    <>
      <div
        className="rm-node"
        data-selected={selected === true}
        data-missing={node.missing === true}
        data-colored={node.color !== undefined}
        data-dimmed={dimmed}
        data-align-h={align.h}
        data-align-v={align.v}
        style={colorStyle}
      >
        {node.missing === true ? (
          <span className="rm-node__broken" aria-label="Source file is missing" title="Source file is missing">
            <Icon name="alert-triangle" />
          </span>
        ) : null}
        {Body !== null ? <Body data={node} /> : <span className="rm-node__title">{node.displayTitle}</span>}
      </div>
      <NodeResizer
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        isVisible={selected === true && callbacks?.locked !== true}
        onResizeEnd={(_event, params) => {
          callbacks?.onResizeEnd(id, params.width, params.height, params.x, params.y);
        }}
      />
      <NodeHandles isConnectable={isConnectable} />
    </>
  );
}
