import { describe, expect, it } from "vitest";
import { boardProgress } from "../src/domain/progress";
import { makeNode, makeState } from "./helpers";

describe("boardProgress", () => {
  it("tallies nodes per status and counts missing status as none", () => {
    const progress = boardProgress(
      makeState([
        makeNode({ status: "done" }),
        makeNode({ status: "done" }),
        makeNode({ status: "in-progress" }),
        makeNode(),
      ]),
    );

    expect(progress.total).toBe(4);
    expect(progress.counts).toEqual({ draft: 0, "in-progress": 1, done: 2, archived: 0, none: 1 });
  });

  it("reports the done share as a rounded percent", () => {
    const progress = boardProgress(
      makeState([makeNode({ status: "done" }), makeNode({ status: "draft" }), makeNode({ status: "draft" })]),
    );

    expect(progress.done).toBe(1);
    expect(progress.donePercent).toBe(33);
  });

  it("returns zero progress for an empty board", () => {
    const progress = boardProgress(makeState([]));

    expect(progress.total).toBe(0);
    expect(progress.donePercent).toBe(0);
    expect(progress.counts.none).toBe(0);
  });
});
