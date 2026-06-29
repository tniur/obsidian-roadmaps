import { useEffect, useRef } from "react";
import { nodeTitle } from "../domain/title";
import type { RoadmapNode } from "../domain/types";
import { ToolbarButton } from "./ToolbarButton";

interface NodePreviewPanelProps {
  node: RoadmapNode;
  mount: (node: RoadmapNode, el: HTMLElement) => () => void;
  refreshNonce: number;
  onEdit: () => void;
  onClose: () => void;
}

/**
 * Right-docked panel that renders a node's source content inside the canvas. The actual
 * Markdown/image rendering is delegated to mount, which owns the Obsidian lifecycle and
 * returns a cleanup run on unmount or when the previewed node changes.
 */
export function NodePreviewPanel({ node, mount, refreshNonce, onEdit, onClose }: NodePreviewPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef(node);

  nodeRef.current = node;

  useEffect(() => {
    const el = bodyRef.current;

    if (el === null) {
      return;
    }

    el.replaceChildren();
    const cleanup = mount(nodeRef.current, el);

    return () => {
      cleanup();
      el.replaceChildren();
    };
  }, [mount, refreshNonce]);

  return (
    <div className="rm-preview">
      <div className="rm-preview__header">
        <span className="rm-preview__title">{nodeTitle(node)}</span>
        <ToolbarButton icon="pencil" label="Edit in Obsidian" onClick={onEdit} />
        <ToolbarButton icon="x" label="Close preview" onClick={onClose} />
      </div>
      <div className="rm-preview__body markdown-rendered" ref={bodyRef} />
    </div>
  );
}
