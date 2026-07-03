import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, type EdgeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import { EDGE_INTERACTION_WIDTH } from "../constants";
import { getEdgeEndpoints } from "./edgeParams";
import type { RoadmapFlowEdge } from "./flow";

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
