import { Panel, useReactFlow } from "@xyflow/react";
import { BACKGROUND_DOTS_ICON_ID } from "../constants";
import { ToolbarButton } from "./ToolbarButton";

interface RoadmapToolbarProps {
  dotsVisible: boolean;
  onToggleDots: () => void;
  locked: boolean;
  onToggleLock: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function RoadmapToolbar({
  dotsVisible,
  onToggleDots,
  locked,
  onToggleLock,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: RoadmapToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-right" className="rm-toolbar">
      <ToolbarButton icon="undo-2" label="Undo" disabled={!canUndo} onClick={onUndo} />
      <ToolbarButton icon="redo-2" label="Redo" disabled={!canRedo} onClick={onRedo} />
      <ToolbarButton icon="frame" label="Fit to nodes" onClick={() => void fitView()} />
      <ToolbarButton icon="zoom-in" label="Zoom in" onClick={() => zoomIn()} />
      <ToolbarButton icon="zoom-out" label="Zoom out" onClick={() => zoomOut()} />
      <ToolbarButton
        icon={locked ? "lock" : "unlock"}
        label={locked ? "Unlock board" : "Lock board"}
        pressed={locked}
        onClick={onToggleLock}
      />
      <ToolbarButton
        icon={BACKGROUND_DOTS_ICON_ID}
        label="Toggle background dots"
        pressed={dotsVisible}
        onClick={onToggleDots}
      />
    </Panel>
  );
}
