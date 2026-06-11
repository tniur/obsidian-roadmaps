import { BaseEdge, getBezierPath, Position, useInternalNode, type EdgeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { EdgeDirection, EdgeLine, EdgeSide } from "../domain/types";
import { getFloatingEdgeParams } from "./edgeParams";

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

interface EdgeMeta {
  direction?: EdgeDirection;
  line?: EdgeLine;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
}

export function FloatingEdge(props: EdgeProps) {
  const { id, source, target, data, style } = props;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (sourceNode === undefined || targetNode === undefined) {
    return null;
  }
  const meta = data as EdgeMeta | undefined;
  const anchored = meta?.fromSide !== undefined && meta?.toSide !== undefined;
  const { sx, sy, tx, ty, sourcePos, targetPos } = anchored
    ? {
        sx: props.sourceX,
        sy: props.sourceY,
        tx: props.targetX,
        ty: props.targetY,
        sourcePos: props.sourcePosition,
        targetPos: props.targetPosition,
      }
    : getFloatingEdgeParams(sourceNode, targetNode);
  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });
  const direction = meta?.direction ?? "forward";
  const line = meta?.line;
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
      <BaseEdge id={id} path={path} style={edgeStyle} interactionWidth={24} />
      {direction === "forward" || direction === "both" ? (
        <path className="rm-edge-arrow" d={arrowPath(tx, ty, inwardDirection(targetPos))} />
      ) : null}
      {direction === "both" ? (
        <path className="rm-edge-arrow" d={arrowPath(sx, sy, inwardDirection(sourcePos))} />
      ) : null}
    </>
  );
}
