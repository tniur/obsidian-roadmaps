import { NodeResizer, type NodeProps } from "@xyflow/react";
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from "../constants";
import { DEFAULT_TEXT_ALIGN } from "../domain/types";
import { colorStyleVars } from "./colorStyle";
import type { RoadmapCardNode } from "./flow";
import { Icon } from "./Icon";
import { canEditNode, useNodeCallbacks } from "./nodeCallbacks";
import { useNodeDimmed } from "./nodeFilterContext";
import { NodeHandles } from "./NodeHandles";
import { getNodeRenderer } from "./nodeRegistry";

/**
 * Card node renderer. The wrapper is a no-box `display: contents` shell whose only job is
 * carrying the inline color variables: the resizer and connection handles are siblings of
 * the card, so variables set on the card itself would never reach them.
 */
export function RoadmapNodeView({ id, data, selected, isConnectable }: NodeProps<RoadmapCardNode>) {
  const node = data;
  const Body = getNodeRenderer(node.kind);
  const callbacks = useNodeCallbacks();
  const dimmed = useNodeDimmed()(node.status, node.priority);
  const align = node.align ?? DEFAULT_TEXT_ALIGN;
  const colorStyle = colorStyleVars("--rm-node-color", node.color);

  return (
    <div className="rm-node-shell" style={colorStyle}>
      <div
        className="rm-node"
        data-kind={node.kind}
        data-selected={selected === true}
        data-missing={node.missing === true}
        data-colored={node.color !== undefined}
        data-dimmed={dimmed}
        data-align-h={align.h}
        data-align-v={align.v}
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
        isVisible={selected === true && canEditNode(callbacks)}
        onResizeEnd={(_event, params) => {
          callbacks?.onResizeEnd(id, params.width, params.height, params.x, params.y);
        }}
      />
      <NodeHandles isConnectable={isConnectable} />
    </div>
  );
}
