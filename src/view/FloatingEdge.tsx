import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, type EdgeProps } from "@xyflow/react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { EDGE_INTERACTION_WIDTH } from "../constants";
import { getEdgeEndpoints } from "./edgeParams";
import type { RoadmapFlowEdge } from "./flow";

/**
 * React Flow places its invisible reconnect anchors from handle-based coordinates, so
 * for a floating end they sit away from the visible endpoint on the node perimeter.
 * The grip rendered at the real endpoint forwards the grab to the actual anchor.
 */
function forwardToReconnectAnchor(event: ReactMouseEvent<SVGCircleElement>, end: "source" | "target"): void {
  const anchor = (event.target as Element)
    .closest(".react-flow__edge")
    ?.querySelector(`.react-flow__edgeupdater-${end}`);

  if (anchor == null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  anchor.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      button: 0,
    }),
  );
}

const ARROW_LENGTH = 6;
const ARROW_SPREAD = 3.375;

interface Vec {
  x: number;
  y: number;
}

function inwardDirection(position: Position): Vec {
  if (position === Position.Left) {
    return { x: 1, y: 0 };
  }

  if (position === Position.Right) {
    return { x: -1, y: 0 };
  }

  if (position === Position.Top) {
    return { x: 0, y: 1 };
  }

  return { x: 0, y: -1 };
}

function arrowPath(x: number, y: number, dir: Vec): string {
  const perp = { x: -dir.y, y: dir.x };
  const bx = x - dir.x * ARROW_LENGTH;
  const by = y - dir.y * ARROW_LENGTH;

  return [
    `M ${bx + perp.x * ARROW_SPREAD} ${by + perp.y * ARROW_SPREAD}`,
    `L ${x} ${y}`,
    `L ${bx - perp.x * ARROW_SPREAD} ${by - perp.y * ARROW_SPREAD}`,
  ].join(" ");
}

export function FloatingEdge(props: EdgeProps<RoadmapFlowEdge>) {
  const { id, source, target, data, style } = props;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (sourceNode === undefined || targetNode === undefined) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeEndpoints(
    sourceNode,
    targetNode,
    data?.fromSide,
    data?.toSide,
  );
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });
  const direction = data?.direction ?? "forward";
  const line = data?.line;
  const label = data?.label;
  const edgeStyle: CSSProperties =
    line === "dotted"
      ? {
          ...style,
          strokeDasharray: "var(--rm-edge-dot)",
          strokeLinecap: "round",
          strokeWidth: "var(--rm-edge-dot-size)",
        }
      : line === "dashed"
        ? { ...style, strokeDasharray: "var(--rm-edge-dash)" }
        : (style ?? {});

  return (
    <>
      <BaseEdge id={id} path={path} style={edgeStyle} interactionWidth={EDGE_INTERACTION_WIDTH} />
      {direction === "forward" || direction === "both" ? (
        <path className="rm-edge-arrow" d={arrowPath(tx, ty, inwardDirection(targetPos))} />
      ) : null}
      {direction === "both" ? (
        <path className="rm-edge-arrow" d={arrowPath(sx, sy, inwardDirection(sourcePos))} />
      ) : null}
      {data?.fromSide === undefined ? (
        <>
          <circle className="rm-edge-grip-dot" cx={sx} cy={sy} />
          <circle
            className="rm-edge-grip"
            cx={sx}
            cy={sy}
            r={EDGE_INTERACTION_WIDTH / 2}
            onMouseDown={(event) => forwardToReconnectAnchor(event, "source")}
          />
        </>
      ) : null}
      {data?.toSide === undefined ? (
        <>
          <circle className="rm-edge-grip-dot" cx={tx} cy={ty} />
          <circle
            className="rm-edge-grip"
            cx={tx}
            cy={ty}
            r={EDGE_INTERACTION_WIDTH / 2}
            onMouseDown={(event) => forwardToReconnectAnchor(event, "target")}
          />
        </>
      ) : null}
      {label !== undefined && label.length > 0 ? (
        <EdgeLabelRenderer>
          <div
            className="rm-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
