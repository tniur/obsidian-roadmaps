import { Panel, useReactFlow, useStore } from "@xyflow/react";
import { BACKGROUND_DOTS_ICON_ID, FIT_VIEW_PADDING } from "../constants";
import { showBoardMenu } from "./menus/boardMenu";
import { ToolbarButton } from "./ToolbarButton";

interface RoadmapToolbarProps {
  compact: boolean;
  onToggleCompact: () => void;
  dotsVisible: boolean;
  onToggleDots: () => void;
  miniMapVisible: boolean;
  onToggleMiniMap: () => void;
  addBarVisible: boolean;
  onToggleAddBar: () => void;
  nodeCountVisible: boolean;
  onToggleNodeCount: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  filterOpen: boolean;
  filterActive: boolean;
  onToggleFilter: () => void;
  locked: boolean;
  onToggleLock: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
  onExportCanvas: () => void;
  onOpenSettings: () => void;
}

/** Subscribes to the zoom component alone, so panning does not re-render the strip;
 * clicking the readout resets the viewport zoom to exactly 100%. */
function ZoomLabel() {
  const zoom = useStore((state) => state.transform[2]);
  const { zoomTo } = useReactFlow();

  return (
    <button
      type="button"
      className="rm-toolbar__zoom"
      aria-label="Reset zoom to 100%"
      title="Reset zoom to 100%"
      onClick={() => void zoomTo(1)}
    >
      {Math.round(zoom * 100)}%
    </button>
  );
}

export function RoadmapToolbar({
  compact,
  onToggleCompact,
  dotsVisible,
  onToggleDots,
  miniMapVisible,
  onToggleMiniMap,
  addBarVisible,
  onToggleAddBar,
  nodeCountVisible,
  onToggleNodeCount,
  searchOpen,
  onToggleSearch,
  filterOpen,
  filterActive,
  onToggleFilter,
  locked,
  onToggleLock,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAutoLayout,
  onExportPdf,
  onExportPng,
  onExportCanvas,
  onOpenSettings,
}: RoadmapToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const settingsButton = (
    <ToolbarButton
      icon="settings"
      label="Board settings"
      onClick={(event) =>
        showBoardMenu(
          {
            miniMapVisible,
            onToggleMiniMap,
            addBarVisible,
            onToggleAddBar,
            nodeCountVisible,
            onToggleNodeCount,
            compact,
            onToggleCompact,
            locked,
            onAutoLayout,
            onExportPdf,
            onExportPng,
            onExportCanvas,
            onOpenSettings,
          },
          event.nativeEvent,
        )
      }
    />
  );

  return (
    <Panel position="bottom-right" className="rm-panel rm-toolbar">
      {compact ? null : (
        <>
          <ToolbarButton icon="undo-2" label="Undo" disabled={!canUndo} onClick={onUndo} />
          <ToolbarButton icon="redo-2" label="Redo" disabled={!canRedo} onClick={onRedo} />
          <div className="rm-toolbar__divider" />
          <ToolbarButton icon="zoom-in" label="Zoom in" onClick={() => void zoomIn()} />
          <ZoomLabel />
          <ToolbarButton icon="zoom-out" label="Zoom out" onClick={() => void zoomOut()} />
          <ToolbarButton
            icon="frame"
            label="Fit to nodes"
            onClick={() => void fitView({ padding: FIT_VIEW_PADDING })}
          />
          <div className="rm-toolbar__divider" />
          <ToolbarButton icon="search" label="Search nodes" pressed={searchOpen} onClick={onToggleSearch} />
          <ToolbarButton
            icon="filter"
            label="Filter nodes"
            pressed={filterOpen || filterActive}
            onClick={onToggleFilter}
          />
          <div className="rm-toolbar__divider" />
          <ToolbarButton
            icon={BACKGROUND_DOTS_ICON_ID}
            label="Toggle background dots"
            pressed={dotsVisible}
            onClick={onToggleDots}
          />
          <ToolbarButton
            icon={locked ? "lock" : "unlock"}
            label={locked ? "Unlock board" : "Lock board"}
            pressed={locked}
            onClick={onToggleLock}
          />
          <div className="rm-toolbar__divider" />
        </>
      )}
      {settingsButton}
    </Panel>
  );
}
