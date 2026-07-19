import {
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clampPreviewWidth, PREVIEW_DEFAULT_WIDTH } from "../constants";
import { nodeSourceLabel, nodeTitle } from "../domain/title";
import type { RoadmapNode } from "../domain/types";
import { Icon } from "./Icon";
import { KIND_ICONS } from "./kindIcons";
import { ToolbarButton } from "./ToolbarButton";

interface NodePreviewPanelProps {
  node: RoadmapNode;
  mount: (node: RoadmapNode, el: HTMLElement, onRendered: () => void) => () => void;
  refreshNonce: number;
  edit?: { label: string; run: () => void };
  initialWidth: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}

/**
 * Right-docked panel that renders a node's source content inside the canvas. A refresh
 * re-mounts the content but carries the scroll offset across, so the reading position survives
 * source-file changes (e.g. a toggled task checkbox). The edit action is optional — board-owned
 * content loses it under lock. The panel resizes by dragging its left edge (double-click
 * resets); the width persists only when the gesture ends.
 */
export function NodePreviewPanel({
  node,
  mount,
  refreshNonce,
  edit,
  initialWidth,
  onWidthChange,
  onClose,
}: NodePreviewPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef(node);
  const scrollRef = useRef(0);
  const [entering, setEntering] = useState(true);
  const [width, setWidth] = useState(initialWidth);
  const widthRef = useRef(width);
  const sourceLabel = nodeSourceLabel(node);

  nodeRef.current = node;
  widthRef.current = width;

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      setEntering(false);
    }
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    const edge = panelRef.current?.getBoundingClientRect().right;

    if (edge !== undefined) {
      setWidth(clampPreviewWidth(edge - event.clientX));
    }
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      onWidthChange(widthRef.current);
    }
  };

  const handleResizeReset = (): void => {
    setWidth(PREVIEW_DEFAULT_WIDTH);
    onWidthChange(PREVIEW_DEFAULT_WIDTH);
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
    <div
      ref={panelRef}
      className={entering ? "rm-preview rm-preview--entering" : "rm-preview"}
      style={{ "--rm-preview-width": `${width}px` } as CSSProperties}
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        className="rm-preview__resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onDoubleClick={handleResizeReset}
      />
      <div className="rm-preview__header">
        <span className="rm-preview__type">
          <Icon name={KIND_ICONS[node.kind]} />
        </span>
        <div className="rm-preview__heading">
          <span className="rm-preview__title">{nodeTitle(node)}</span>
          {sourceLabel !== undefined ? <span className="rm-preview__source">{sourceLabel}</span> : null}
        </div>
        {edit !== undefined ? <ToolbarButton icon="pencil" label={edit.label} onClick={edit.run} /> : null}
        <ToolbarButton icon="x" label="Close preview" onClick={onClose} />
      </div>
      {node.description !== undefined ? <div className="rm-preview__desc">{node.description}</div> : null}
      <div className="rm-preview__body markdown-rendered" ref={bodyRef} />
    </div>
  );
}
