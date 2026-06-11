import { describe, expect, it } from "vitest";
import type { RoadmapState } from "../src/domain/types";
import { parseState, serializeState } from "../src/state/codec";

function sample(): RoadmapState {
  return {
    schemaVersion: 1,
    id: "rm1",
    nodes: {
      n1: {
        id: "n1",
        kind: "note",
        source: { type: "note", file: "notes/a.md" },
        layout: { x: 10, y: 20, width: 200, height: 80 },
        status: "in-progress",
        priority: "high",
        style: { color: "#abc" },
      },
    },
    clusters: {},
    edges: {
      e1: {
        id: "e1",
        from: { type: "node", id: "n1" },
        to: { type: "node", id: "n1" },
        direction: "both",
        fromSide: "bottom",
        toSide: "left",
        style: { line: "dotted" },
      },
      e2: {
        id: "e2",
        from: { type: "node", id: "n1" },
        to: { type: "node", id: "n1" },
        direction: "forward",
      },
    },
    viewport: { x: 1, y: 2, zoom: 1.5 },
  };
}

describe("state codec", () => {
  it("round-trips domain state through compact JSON", () => {
    const state = sample();

    expect(parseState(serializeState(state))).toEqual(state);
  });

  it("serializes deterministically with sorted keys", () => {
    const json = serializeState(sample());

    expect(serializeState(parseState(json))).toBe(json);
  });

  it("rejects state that fails the schema", () => {
    expect(() => parseState("{}")).toThrow();
    expect(() => parseState('{"v":1,"id":"x","n":{"n1":{"k":"note"}}}')).toThrow();
  });
});
