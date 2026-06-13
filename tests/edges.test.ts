import { describe, expect, it } from "vitest";
import { facingSide } from "../src/domain/edges";
import type { RoadmapLayout } from "../src/domain/types";

function layout(x: number, y: number): RoadmapLayout {
  return { x, y, width: 100, height: 50 };
}

describe("facingSide", () => {
  const self = layout(0, 0);

  it("picks the side pointing toward the other node", () => {
    expect(facingSide(self, layout(300, 0))).toBe("right");
    expect(facingSide(self, layout(-300, 0))).toBe("left");
    expect(facingSide(self, layout(0, 300))).toBe("bottom");
    expect(facingSide(self, layout(0, -300))).toBe("top");
  });
});
