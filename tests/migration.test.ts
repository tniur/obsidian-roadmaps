import { describe, expect, it } from "vitest";
import { parseState, serializeState, StateVersionError } from "../src/state/codec";
import { emptyState } from "../src/state/document";

describe("state version gate", () => {
  it("parses the current schema version", () => {
    const json = serializeState(emptyState());

    expect(() => parseState(json)).not.toThrow();
  });

  it("rejects a state written by a newer plugin version", () => {
    const json = serializeState(emptyState()).replace('"v": 1', '"v": 2');

    expect(() => parseState(json)).toThrow(StateVersionError);
  });

  it("rejects a nonsensical version as unsupported", () => {
    const json = serializeState(emptyState()).replace('"v": 1', '"v": 0');

    expect(() => parseState(json)).toThrow(StateVersionError);
  });

  it("still fails plain schema violations as ordinary errors", () => {
    const json = serializeState(emptyState()).replace('"v": 1', '"v": "x"');

    expect(() => parseState(json)).toThrow();
    expect(() => parseState(json)).not.toThrow(StateVersionError);
  });
});
