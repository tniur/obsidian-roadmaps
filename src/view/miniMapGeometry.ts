import { absoluteNodePosition, nodeSize, type RoadmapFlowNode } from "./flow";

const BOUNDS_PADDING = 0.06;

/** Floor for the viewport rect, as a share of the frame, so a camera parked outside the content
 * still shows a sliver pinned to the edge it left through instead of vanishing. */
const MIN_VIEW_SHARE = 0.04;

/** How far the frame may grow past the content to follow the camera. The cap is what keeps the
 * nodes readable: past it the frame stops widening and the content packs against an edge. */
const MAX_FRAME_GROWTH = 3;

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function contentBounds(nodes: readonly RoadmapFlowNode[]): MapRect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    if (node.hidden === true) {
      continue;
    }

    const { x, y } = absoluteNodePosition(node, nodes);
    const { width, height } = nodeSize(node);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  if (!Number.isFinite(minX)) {
    return null;
  }

  const pad = Math.max(Math.max(maxX - minX, maxY - minY) * BOUNDS_PADDING, 1);

  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

export function clampToBounds(rect: MapRect, bounds: MapRect): MapRect {
  const floor = Math.max(bounds.width, bounds.height) * MIN_VIEW_SHARE;
  const maxX = bounds.x + bounds.width;
  const maxY = bounds.y + bounds.height;
  const left = Math.min(Math.max(rect.x, bounds.x), maxX - floor);
  const top = Math.min(Math.max(rect.y, bounds.y), maxY - floor);

  return {
    x: left,
    y: top,
    width: Math.max(Math.min(rect.x + rect.width, maxX), left + floor) - left,
    height: Math.max(Math.min(rect.y + rect.height, maxY), top + floor) - top,
  };
}

export function viewportRect(transform: readonly [number, number, number], width: number, height: number): MapRect {
  const zoom = transform[2];

  return { x: -transform[0] / zoom, y: -transform[1] / zoom, width: width / zoom, height: height / zoom };
}

function capAxis(
  unionMin: number,
  unionMax: number,
  contentMin: number,
  contentMax: number,
  max: number,
): [number, number] {
  const excess = unionMax - unionMin - max;

  if (excess <= 0) {
    return [unionMin, unionMax];
  }

  const before = contentMin - unionMin;
  const after = unionMax - contentMax;
  const total = before + after;

  return [unionMin + (excess * before) / total, unionMax - (excess * after) / total];
}

/**
 * Frame the map draws: the content plus wherever the camera has wandered, capped so the nodes
 * never shrink away and instead pack against the edge away from a far camera.
 */
export function boardFrame(content: MapRect, view: MapRect): MapRect {
  if (view.width <= 0 || view.height <= 0) {
    return content;
  }

  const contentMaxX = content.x + content.width;
  const contentMaxY = content.y + content.height;
  const [x0, x1] = capAxis(
    Math.min(content.x, view.x),
    Math.max(contentMaxX, view.x + view.width),
    content.x,
    contentMaxX,
    content.width * MAX_FRAME_GROWTH,
  );
  const [y0, y1] = capAxis(
    Math.min(content.y, view.y),
    Math.max(contentMaxY, view.y + view.height),
    content.y,
    contentMaxY,
    content.height * MAX_FRAME_GROWTH,
  );

  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
