import { Position, type InternalNode } from "@xyflow/react";
import type { EdgeSide } from "../domain/types";

interface Point {
  x: number;
  y: number;
}

function center(node: InternalNode): Point {
  return {
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
  };
}

function sidePoint(node: InternalNode, side: EdgeSide): Point {
  const x = node.internals.positionAbsolute.x;
  const y = node.internals.positionAbsolute.y;
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  switch (side) {
    case "top":
      return { x: x + w / 2, y };
    case "right":
      return { x: x + w, y: y + h / 2 };
    case "bottom":
      return { x: x + w / 2, y: y + h };
    case "left":
      return { x, y: y + h / 2 };
  }
}

function positionOfSide(side: EdgeSide): Position {
  switch (side) {
    case "top":
      return Position.Top;
    case "right":
      return Position.Right;
    case "bottom":
      return Position.Bottom;
    case "left":
      return Position.Left;
  }
}

/** Point on the node border along the line from its center toward `target`. */
function intersectionToward(node: InternalNode, target: Point): Point {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const cx = node.internals.positionAbsolute.x + w;
  const cy = node.internals.positionAbsolute.y + h;
  const xx = (target.x - cx) / (2 * w) - (target.y - cy) / (2 * h);
  const yy = (target.x - cx) / (2 * w) + (target.y - cy) / (2 * h);
  const a = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  const dx = a * xx;
  const dy = a * yy;

  return { x: w * (dx + dy) + cx, y: h * (-dx + dy) + cy };
}

function borderSide(node: InternalNode, point: Point): Position {
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

export interface EdgeEndpoints {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
}

/**
 * Endpoint coordinates for an edge. Each end is either anchored to a side (handle
 * midpoint) or floating: a floating end lands on the node border facing the other end,
 * so it slides around the perimeter as nodes move.
 */
export function getEdgeEndpoints(
  source: InternalNode,
  target: InternalNode,
  fromSide?: EdgeSide,
  toSide?: EdgeSide,
): EdgeEndpoints {
  let sp: Point;
  let tp: Point;
  let sourcePos: Position;
  let targetPos: Position;
  if (fromSide !== undefined && toSide !== undefined) {
    sp = sidePoint(source, fromSide);
    sourcePos = positionOfSide(fromSide);
    tp = sidePoint(target, toSide);
    targetPos = positionOfSide(toSide);
  } else if (fromSide !== undefined) {
    sp = sidePoint(source, fromSide);
    sourcePos = positionOfSide(fromSide);
    tp = intersectionToward(target, sp);
    targetPos = borderSide(target, tp);
  } else if (toSide !== undefined) {
    tp = sidePoint(target, toSide);
    targetPos = positionOfSide(toSide);
    sp = intersectionToward(source, tp);
    sourcePos = borderSide(source, sp);
  } else {
    sp = intersectionToward(source, center(target));
    sourcePos = borderSide(source, sp);
    tp = intersectionToward(target, center(source));
    targetPos = borderSide(target, tp);
  }

  return { sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y, sourcePos, targetPos };
}
