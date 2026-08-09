import type { Node, NodePositionChange } from "@xyflow/react";

type Axis = "x" | "y";

/** One side of an equal-gap match, drawn as a dimension bar between two node edges. */
export interface SpacingGuide {
  axis: Axis;
  from: number;
  to: number;
  cross: number;
}

/** What the overlay draws for the current drag position, in flow coordinates. */
export interface BoardGuides {
  horizontal?: number;
  vertical?: number;
  spacing?: SpacingGuide[];
}

export interface HelperLineResult extends BoardGuides {
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

function nodeBounds(node: Node): Bounds {
  return bounds(node.position.x, node.position.y, node.measured?.width ?? 0, node.measured?.height ?? 0);
}

interface Span {
  start: number;
  end: number;
  size: number;
}

function mainSpan(box: Bounds, axis: Axis): Span {
  return axis === "x"
    ? { start: box.left, end: box.right, size: box.width }
    : { start: box.top, end: box.bottom, size: box.height };
}

function crossSpan(box: Bounds, axis: Axis): Span {
  return axis === "x"
    ? { start: box.top, end: box.bottom, size: box.height }
    : { start: box.left, end: box.right, size: box.width };
}

function crossOverlap(one: Bounds, two: Bounds, axis: Axis): Span {
  const a = crossSpan(one, axis);
  const b = crossSpan(two, axis);
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);

  return { start, end, size: end - start };
}

interface Candidate {
  d: number;
  guide: number;
  snap: number;
}

interface SpacingMatch {
  d: number;
  snap: number;
  guides: SpacingGuide[];
}

/**
 * Equal-gap placements along `axis`: the dragged node either repeats the gap of a neighbouring
 * pair or sits centred between them. Only nodes overlapping it across the axis are neighbours,
 * so a row is measured against its row and a column against its column.
 */
function getSpacingMatch(active: Bounds, others: Bounds[], axis: Axis, distance: number): SpacingMatch | undefined {
  const row = others.filter((box) => crossOverlap(active, box, axis).size > 0);

  if (row.length < 2) {
    return undefined;
  }

  const sorted = [...row].sort((one, two) => mainSpan(one, axis).start - mainSpan(two, axis).start);
  const self = mainSpan(active, axis);
  let best: SpacingMatch | undefined;

  const consider = (snap: number, guides: SpacingGuide[]): void => {
    const d = Math.abs(self.start - snap);

    if (d < distance && (best === undefined || d < best.d)) {
      best = { d, snap, guides };
    }
  };

  const bar = (one: Bounds, two: Bounds, from: number, to: number): SpacingGuide => {
    const overlap = crossOverlap(one, two, axis);

    return { axis, from, to, cross: (overlap.start + overlap.end) / 2 };
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    const p = mainSpan(prev, axis);
    const q = mainSpan(next, axis);
    const gap = q.start - p.end;

    if (gap <= 0) {
      continue;
    }

    const reference = bar(prev, next, p.end, q.start);
    const trailing = q.end + gap;
    const leading = p.start - gap - self.size;
    const free = gap - self.size;

    consider(trailing, [reference, bar(next, active, q.end, trailing)]);
    consider(leading, [bar(active, prev, leading + self.size, p.start), reference]);

    if (free > 0) {
      const centred = p.end + free / 2;

      consider(centred, [bar(prev, active, p.end, centred), bar(active, next, centred + self.size, q.start)]);
    }
  }

  return best;
}

/**
 * Guides for a node being dragged: it matches sides and centres against the other nodes, and
 * equal gaps to their neighbours, within `distance`. Per axis the closer match wins, so a
 * spacing match replaces the side guide it beats. Returns the guides and the snapped top-left.
 */
export function getHelperLines(change: NodePositionChange, nodes: Node[], distance = 5): HelperLineResult {
  const result: HelperLineResult = {};
  const active = nodes.find((node) => node.id === change.id);

  if (active === undefined || change.position === undefined) {
    return result;
  }

  const a = bounds(change.position.x, change.position.y, active.measured?.width ?? 0, active.measured?.height ?? 0);
  const others = nodes.filter((node) => node.id !== active.id).map(nodeBounds);
  let verticalDistance = distance;
  let horizontalDistance = distance;

  for (const b of others) {
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

  const spacingX = getSpacingMatch(a, others, "x", verticalDistance);
  const spacingY = getSpacingMatch(a, others, "y", horizontalDistance);

  if (spacingX !== undefined) {
    result.vertical = undefined;
    result.snapX = spacingX.snap;
  }

  if (spacingY !== undefined) {
    result.horizontal = undefined;
    result.snapY = spacingY.snap;
  }

  const spacing = [...(spacingX?.guides ?? []), ...(spacingY?.guides ?? [])];

  if (spacing.length > 0) {
    result.spacing = spacing;
  }

  return result;
}

/** Moves guides from a cluster child's parent-relative coordinates into flow coordinates. */
export function offsetGuides(guides: BoardGuides, dx: number, dy: number): BoardGuides {
  return {
    horizontal: guides.horizontal === undefined ? undefined : guides.horizontal + dy,
    vertical: guides.vertical === undefined ? undefined : guides.vertical + dx,
    spacing: guides.spacing?.map((guide) => {
      const along = guide.axis === "x" ? dx : dy;
      const across = guide.axis === "x" ? dy : dx;

      return { ...guide, from: guide.from + along, to: guide.to + along, cross: guide.cross + across };
    }),
  };
}

/** Value equality, so a drag frame that changes no guide keeps the previous overlay state. */
export function sameGuides(one: BoardGuides, two: BoardGuides): boolean {
  if (one.horizontal !== two.horizontal || one.vertical !== two.vertical) {
    return false;
  }

  const a = one.spacing ?? [];
  const b = two.spacing ?? [];

  return (
    a.length === b.length &&
    a.every((guide, index) => {
      const other = b[index];

      return (
        guide.axis === other.axis && guide.from === other.from && guide.to === other.to && guide.cross === other.cross
      );
    })
  );
}
