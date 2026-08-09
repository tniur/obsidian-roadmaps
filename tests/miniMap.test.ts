import { describe, expect, it } from "vitest";
import { ROADMAP_CLUSTER_TYPE, ROADMAP_NODE_TYPE, type RoadmapFlowNode } from "../src/view/flow";
import { boardFrame, clampToBounds, contentBounds, viewportRect, type MapRect } from "../src/view/miniMapGeometry";

function card(id: string, x: number, y: number, width = 100, height = 100): RoadmapFlowNode {
  return {
    id,
    type: ROADMAP_NODE_TYPE,
    position: { x, y },
    width,
    height,
    data: { displayTitle: id, kind: "text" },
  };
}

function cluster(id: string, x: number, y: number, width: number, height: number): RoadmapFlowNode {
  return {
    id,
    type: ROADMAP_CLUSTER_TYPE,
    position: { x, y },
    width,
    height,
    data: { title: id, collapsed: false, count: 0 },
  };
}

const FRAME: MapRect = { x: 0, y: 0, width: 1000, height: 1000 };

function frameOf(nodes: readonly RoadmapFlowNode[]): MapRect {
  const bounds = contentBounds(nodes);

  if (bounds === null) {
    throw new Error("expected bounds for a non-empty board");
  }

  return bounds;
}

describe("mini-map bounds", () => {
  it("frames every visible node with padding and ignores the camera", () => {
    const bounds = frameOf([card("a", 0, 0), card("b", 400, 200)]);

    expect(bounds.x).toBeLessThan(0);
    expect(bounds.y).toBeLessThan(0);
    expect(bounds.x + bounds.width).toBeGreaterThan(500);
    expect(bounds.y + bounds.height).toBeGreaterThan(300);
  });

  it("skips hidden members of collapsed clusters", () => {
    const parent = cluster("c", 0, 0, 200, 200);
    const hidden: RoadmapFlowNode = { ...card("a", 10, 10), parentId: "c", hidden: true };
    const withoutFar = frameOf([parent, hidden]);

    expect(frameOf([parent, hidden, card("far", 900, 900)]).width).toBeGreaterThan(withoutFar.width);
    expect(withoutFar.x + withoutFar.width).toBeLessThan(300);
  });

  it("places cluster members at their absolute position", () => {
    const parent = cluster("c", 500, 500, 200, 200);
    const child: RoadmapFlowNode = { ...card("a", 20, 20), parentId: "c" };

    expect(frameOf([parent, child]).x).toBeGreaterThan(400);
  });

  it("returns null when there is nothing to frame", () => {
    expect(contentBounds([])).toBeNull();
    expect(contentBounds([{ ...card("a", 0, 0), hidden: true }])).toBeNull();
  });
});

describe("mini-map frame", () => {
  const content: MapRect = { x: 0, y: 0, width: 100, height: 100 };

  function contains(outer: MapRect, inner: MapRect): boolean {
    return (
      outer.x <= inner.x &&
      outer.y <= inner.y &&
      outer.x + outer.width >= inner.x + inner.width &&
      outer.y + outer.height >= inner.y + inner.height
    );
  }

  it("follows a nearby camera by taking in the viewport", () => {
    const frame = boardFrame(content, { x: 60, y: 0, width: 100, height: 100 });

    expect(frame).toEqual({ x: 0, y: 0, width: 160, height: 100 });
  });

  it("stops growing once the camera drifts past the cap", () => {
    const near = boardFrame(content, { x: 500, y: 0, width: 100, height: 100 });
    const far = boardFrame(content, { x: 50000, y: 0, width: 100, height: 100 });

    expect(near.width).toBe(content.width * 3);
    expect(far.width).toBe(near.width);
  });

  it("keeps the content inside the frame however far the camera goes", () => {
    for (const camera of [
      { x: 50000, y: 0, width: 100, height: 100 },
      { x: -50000, y: -50000, width: 100, height: 100 },
      { x: 0, y: 90000, width: 4000, height: 4000 },
    ]) {
      expect(contains(boardFrame(content, camera), content)).toBe(true);
    }
  });

  it("packs the content against the edge away from a far camera", () => {
    const right = boardFrame(content, { x: 50000, y: 0, width: 100, height: 100 });
    const left = boardFrame(content, { x: -50000, y: 0, width: 100, height: 100 });

    expect(right.x).toBe(content.x);
    expect(left.x + left.width).toBe(content.x + content.width);
  });

  it("ignores a viewport that has not been measured yet", () => {
    expect(boardFrame(content, { x: -9000, y: -9000, width: 0, height: 0 })).toEqual(content);
  });

  it("closes in on a camera zoomed well inside the content", () => {
    const camera: MapRect = { x: 40, y: 40, width: 20, height: 20 };
    const frame = boardFrame(content, camera);

    expect(frame.width).toBeLessThan(content.width);
    expect(camera.width / frame.width).toBeCloseTo(0.5);
    expect(contains(frame, camera)).toBe(true);
  });

  it("keeps zooming as the camera keeps zooming", () => {
    const share = (size: number) =>
      size / boardFrame(content, { x: 50 - size / 2, y: 50 - size / 2, width: size, height: size }).width;

    expect(share(20)).toBeCloseTo(share(5));
  });

  it("follows a small camera panning across the board", () => {
    const left = boardFrame(content, { x: 10, y: 40, width: 20, height: 20 });
    const right = boardFrame(content, { x: 70, y: 40, width: 20, height: 20 });

    expect(right.x).toBeGreaterThan(left.x);
    expect(right.width).toBeCloseTo(left.width);
  });

  it("leaves a camera that already fills the frame alone", () => {
    expect(boardFrame(content, { x: 0, y: 0, width: 100, height: 100 })).toEqual(content);
    expect(boardFrame(content, { x: 20, y: 20, width: 60, height: 60 })).toEqual(content);
  });
});

describe("mini-map viewport rect", () => {
  it("reads the board rect the camera shows", () => {
    expect(viewportRect([-100, -200, 2], 800, 600)).toEqual({ x: 50, y: 100, width: 400, height: 300 });
  });

  it("keeps a viewport inside the frame untouched", () => {
    const inside: MapRect = { x: 100, y: 100, width: 200, height: 200 };

    expect(clampToBounds(inside, FRAME)).toEqual(inside);
  });

  it("trims a viewport wider than the frame down to it", () => {
    expect(clampToBounds({ x: -500, y: -500, width: 5000, height: 5000 }, FRAME)).toEqual(FRAME);
  });

  it("pins a sliver to the edge the camera left through", () => {
    const far = clampToBounds({ x: 9000, y: 400, width: 300, height: 300 }, FRAME);

    expect(far.width).toBeGreaterThan(0);
    expect(far.x + far.width).toBe(FRAME.width);
    expect(far.y).toBe(400);
  });

  it("pins a sliver at the near edge too", () => {
    const far = clampToBounds({ x: -9000, y: -9000, width: 300, height: 300 }, FRAME);

    expect(far.x).toBe(0);
    expect(far.y).toBe(0);
    expect(far.width).toBeGreaterThan(0);
    expect(far.height).toBeGreaterThan(0);
  });
});
