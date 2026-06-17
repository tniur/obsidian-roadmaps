import { Panel, useReactFlow, useStore } from "@xyflow/react";
import { useCallback } from "react";
import type { NodePlacement } from "../domain/create";
import { ToolbarButton } from "./ToolbarButton";

interface NodeToolbarProps {
  onCreateNote: (placement: NodePlacement) => void;
  onAddNote: (placement: NodePlacement) => void;
  onAddUrl: (placement: NodePlacement) => void;
  onAddImage: (placement: NodePlacement) => void;
  onAddText: (placement: NodePlacement) => void;
  onAddAttachment: (placement: NodePlacement) => void;
}

export function NodeToolbar({
  onCreateNote,
  onAddNote,
  onAddUrl,
  onAddImage,
  onAddText,
  onAddAttachment,
}: NodeToolbarProps) {
  const { getViewport } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  const placement = useCallback((): NodePlacement => {
    const { x, y, zoom } = getViewport();

    return { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
  }, [getViewport, width, height]);

  return (
    <Panel position="top-left" className="rm-node-toolbar">
      <ToolbarButton icon="plus" label="Create note" onClick={() => onCreateNote(placement())} />
      <ToolbarButton
        icon="search"
        label="Add note from vault"
        onClick={() => onAddNote(placement())}
      />
      <ToolbarButton icon="link" label="Add URL" onClick={() => onAddUrl(placement())} />
      <ToolbarButton icon="image" label="Add image" onClick={() => onAddImage(placement())} />
      <ToolbarButton icon="type" label="Add text" onClick={() => onAddText(placement())} />
      <ToolbarButton
        icon="paperclip"
        label="Add attachment"
        onClick={() => onAddAttachment(placement())}
      />
    </Panel>
  );
}
