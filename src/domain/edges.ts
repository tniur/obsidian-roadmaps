import type { EdgeSide, RoadmapLayout } from "./types";

/** Side of `self` that faces the center of `other`; used when re-anchoring a floating end. */
export function facingSide(self: RoadmapLayout, other: RoadmapLayout): EdgeSide {
  const sx = self.x + self.width / 2;
  const sy = self.y + self.height / 2;
  const ox = other.x + other.width / 2;
  const oy = other.y + other.height / 2;
  const dx = ox - sx;
  const dy = oy - sy;

  if (Math.abs(dx) * self.height >= Math.abs(dy) * self.width) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "bottom" : "top";
}
