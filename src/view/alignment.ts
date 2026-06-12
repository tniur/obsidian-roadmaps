import type { Node, NodePositionChange } from "@xyflow/react";

export interface HelperLineResult {
  horizontal?: number;
  vertical?: number;
  snapX?: number;
  snapY?: number;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function bounds(x: number, y: number, width: number, height: number): Bounds {
  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

interface Candidate {
  d: number;
  guide: number;
  snap: number;
}

/**
 * Computes alignment guides for a node being dragged. Compares the dragged node's
 * left/right/center against every other node on the X axis (vertical guides) and its
 * top/bottom/center on the Y axis (horizontal guides), keeping the closest match within
 * `distance`. Returns the guide coordinate to render and the snapped top-left position.
 */
export function getHelperLines(
  change: NodePositionChange,
  nodes: Node[],
  distance = 5,
): HelperLineResult {
  const result: HelperLineResult = {};
  const active = nodes.find((node) => node.id === change.id);
  if (active === undefined || change.position === undefined) {
    return result;
  }
  const a = bounds(
    change.position.x,
    change.position.y,
    active.measured?.width ?? 0,
    active.measured?.height ?? 0,
  );
  let verticalDistance = distance;
  let horizontalDistance = distance;

  for (const node of nodes) {
    if (node.id === active.id) {
      continue;
    }
    const b = bounds(
      node.position.x,
      node.position.y,
      node.measured?.width ?? 0,
      node.measured?.height ?? 0,
    );

    const vertical: Candidate[] = [
      { d: Math.abs(a.left - b.left), guide: b.left, snap: b.left },
      { d: Math.abs(a.right - b.right), guide: b.right, snap: b.right - a.width },
      { d: Math.abs(a.left - b.right), guide: b.right, snap: b.right },
      { d: Math.abs(a.right - b.left), guide: b.left, snap: b.left - a.width },
      { d: Math.abs(a.centerX - b.centerX), guide: b.centerX, snap: b.centerX - a.width / 2 },
    ];
    for (const candidate of vertical) {
      if (candidate.d < verticalDistance) {
        verticalDistance = candidate.d;
        result.vertical = candidate.guide;
        result.snapX = candidate.snap;
      }
    }

    const horizontal: Candidate[] = [
      { d: Math.abs(a.top - b.top), guide: b.top, snap: b.top },
      { d: Math.abs(a.bottom - b.bottom), guide: b.bottom, snap: b.bottom - a.height },
      { d: Math.abs(a.top - b.bottom), guide: b.bottom, snap: b.bottom },
      { d: Math.abs(a.bottom - b.top), guide: b.top, snap: b.top - a.height },
      { d: Math.abs(a.centerY - b.centerY), guide: b.centerY, snap: b.centerY - a.height / 2 },
    ];
    for (const candidate of horizontal) {
      if (candidate.d < horizontalDistance) {
        horizontalDistance = candidate.d;
        result.horizontal = candidate.guide;
        result.snapY = candidate.snap;
      }
    }
  }

  return result;
}
