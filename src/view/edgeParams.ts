import { Position, type InternalNode } from "@xyflow/react";

interface Point {
  x: number;
  y: number;
}

function nodeIntersection(node: InternalNode, other: InternalNode): Point {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const cx = node.internals.positionAbsolute.x + w;
  const cy = node.internals.positionAbsolute.y + h;
  const ox = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2;
  const oy = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2;
  const xx = (ox - cx) / (2 * w) - (oy - cy) / (2 * h);
  const yy = (ox - cx) / (2 * w) + (oy - cy) / (2 * h);
  const a = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  const dx = a * xx;
  const dy = a * yy;

  return { x: w * (dx + dy) + cx, y: h * (-dx + dy) + cy };
}

function edgeSide(node: InternalNode, point: Point): Position {
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const w = node.measured.width ?? 0;
  if (px <= nx + 1) {
    return Position.Left;
  }
  if (px >= nx + w - 1) {
    return Position.Right;
  }
  if (py <= ny + 1) {
    return Position.Top;
  }

  return Position.Bottom;
}

export interface FloatingEdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
}

export function getFloatingEdgeParams(
  source: InternalNode,
  target: InternalNode,
): FloatingEdgeParams {
  const sourcePoint = nodeIntersection(source, target);
  const targetPoint = nodeIntersection(target, source);

  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y,
    sourcePos: edgeSide(source, sourcePoint),
    targetPos: edgeSide(target, targetPoint),
  };
}
