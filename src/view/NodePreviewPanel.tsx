import { useEffect, useRef, useState, type AnimationEvent } from "react";
import { nodeTitle } from "../domain/title";
import type { RoadmapNode } from "../domain/types";
import { ToolbarButton } from "./ToolbarButton";

interface NodePreviewPanelProps {
  node: RoadmapNode;
  mount: (node: RoadmapNode, el: HTMLElement, onRendered: () => void) => () => void;
  refreshNonce: number;
  onEdit: () => void;
  onClose: () => void;
}

/**
 * Right-docked panel that renders a node's source content inside the canvas. The actual
 * Markdown/image rendering is delegated to mount, which owns the Obsidian lifecycle and
 * returns a cleanup run on unmount or when the previewed node changes. A refresh
 * re-mounts the content from scratch; the scroll offset carries across, so the reading
 * position survives source-file changes (e.g. after toggling a task checkbox).
 */
export function NodePreviewPanel({ node, mount, refreshNonce, onEdit, onClose }: NodePreviewPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef(node);
  const scrollRef = useRef(0);
  const [entering, setEntering] = useState(true);

  nodeRef.current = node;

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      setEntering(false);
    }
  };

  useEffect(() => {
    const el = bodyRef.current;

    if (el === null) {
      return;
    }

    el.replaceChildren();
    const cleanup = mount(nodeRef.current, el, () => {
      el.scrollTop = scrollRef.current;
    });

    return () => {
      scrollRef.current = el.scrollTop;
      cleanup();
      el.replaceChildren();
    };
  }, [mount, refreshNonce]);

  return (
    <div className={entering ? "rm-preview rm-preview--entering" : "rm-preview"} onAnimationEnd={handleAnimationEnd}>
      <div className="rm-preview__header">
        <span className="rm-preview__title">{nodeTitle(node)}</span>
        <ToolbarButton icon="pencil" label="Edit in Obsidian" onClick={onEdit} />
        <ToolbarButton icon="x" label="Close preview" onClick={onClose} />
      </div>
      <div className="rm-preview__body markdown-rendered" ref={bodyRef} />
    </div>
  );
}
