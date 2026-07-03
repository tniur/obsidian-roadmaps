import { Panel, useReactFlow, useStore } from "@xyflow/react";
import { useCallback } from "react";
import type { NodePlacement } from "../domain/create";
import { ADD_NODE_ACTIONS, type AddNodeActionId } from "./addNodeActions";
import { ToolbarButton } from "./ToolbarButton";

interface NodeToolbarProps {
  onAction: (id: AddNodeActionId, placement: NodePlacement) => void;
}

export function NodeToolbar({ onAction }: NodeToolbarProps) {
  const { getViewport } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  const placement = useCallback((): NodePlacement => {
    const { x, y, zoom } = getViewport();

    return { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
  }, [getViewport, width, height]);

  return (
    <Panel position="top-left" className="rm-panel rm-node-toolbar">
      {ADD_NODE_ACTIONS.map(({ id, label, icon }) => (
        <ToolbarButton key={id} icon={icon} label={label} onClick={() => onAction(id, placement())} />
      ))}
    </Panel>
  );
}
