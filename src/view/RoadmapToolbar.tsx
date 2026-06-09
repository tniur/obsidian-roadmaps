import { Panel, useReactFlow } from "@xyflow/react";
import { BACKGROUND_DOTS_ICON_ID } from "../constants";
import { ToolbarButton } from "./ToolbarButton";

interface RoadmapToolbarProps {
  dotsVisible: boolean;
  onToggleDots: () => void;
}

export function RoadmapToolbar({ dotsVisible, onToggleDots }: RoadmapToolbarProps) {
  const { zoomIn, zoomOut } = useReactFlow();

  return (
    <Panel position="bottom-right" className="rm-toolbar">
      <ToolbarButton icon="zoom-in" label="Zoom in" onClick={() => zoomIn()} />
      <ToolbarButton icon="zoom-out" label="Zoom out" onClick={() => zoomOut()} />
      <ToolbarButton
        icon={BACKGROUND_DOTS_ICON_ID}
        label="Toggle background dots"
        pressed={dotsVisible}
        onClick={onToggleDots}
      />
    </Panel>
  );
}
