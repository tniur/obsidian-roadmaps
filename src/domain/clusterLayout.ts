import { CLUSTER_NODE_GAP, CLUSTER_PADDING, COLLAPSED_CLUSTER_HEIGHT } from "../constants";
import type { RoadmapLayout, RoadmapNode } from "./types";

export interface ClusterArrangement {
  width: number;
  height: number;
  positions: Map<string, { x: number; y: number }>;
}

/** Bounding box around the members' layouts, or null for an empty list. */
export function membersBoundingBox(members: readonly RoadmapNode[]): RoadmapLayout | null {
  if (members.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const member of members) {
    minX = Math.min(minX, member.layout.x);
    minY = Math.min(minY, member.layout.y);
    maxX = Math.max(maxX, member.layout.x + member.layout.width);
    maxY = Math.max(maxY, member.layout.y + member.layout.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Grid layout for cluster members: reading order (by current y, then x), cell sized by
 * the largest member, full rows centered and each node centered within its cell. Returns
 * member positions relative to the cluster origin and the exact cluster size wrapping
 * the grid. `baseWidth` bounds how many columns fit; the result may shrink below it.
 */
export function arrangeClusterGrid(members: readonly RoadmapNode[], baseWidth: number): ClusterArrangement | null {
  if (members.length === 0) {
    return null;
  }

  const sorted = [...members].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  const cellW = Math.max(...sorted.map((node) => node.layout.width));
  const cellH = Math.max(...sorted.map((node) => node.layout.height));
  const gap = CLUSTER_NODE_GAP;
  const top = COLLAPSED_CLUSTER_HEIGHT;
  const effectiveBase = Math.max(baseWidth, cellW + CLUSTER_PADDING * 2);
  const columns = Math.min(
    sorted.length,
    Math.max(1, Math.floor((effectiveBase - CLUSTER_PADDING * 2 + gap) / (cellW + gap))),
  );
  const contentWidth = columns * (cellW + gap) - gap;
  const positions = new Map<string, { x: number; y: number }>();

  sorted.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, sorted.length - row * columns);
    const rowOffset = (contentWidth - (rowCount * (cellW + gap) - gap)) / 2;
    const cellX = CLUSTER_PADDING + rowOffset + col * (cellW + gap);
    const cellY = top + row * (cellH + gap);

    positions.set(node.id, {
      x: cellX + (cellW - node.layout.width) / 2,
      y: cellY + (cellH - node.layout.height) / 2,
    });
  });
  const rows = Math.ceil(sorted.length / columns);

  return {
    width: CLUSTER_PADDING * 2 + contentWidth,
    height: top + rows * (cellH + gap) - gap + CLUSTER_PADDING,
    positions,
  };
}
