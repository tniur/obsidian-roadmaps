import { Panel } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { searchNodes } from "../domain/search";
import type { RoadmapState } from "../domain/types";
import { Icon } from "./Icon";
import { ToolbarButton } from "./ToolbarButton";

interface NodeSearchPanelProps {
  state: RoadmapState;
  onActivate: (nodeId: string) => void;
  onClose: () => void;
}

/**
 * Top-centred find bar. Typing recomputes matches live and jumps to the first one; the
 * caller centres the camera on and selects each activated node. Enter / arrows cycle
 * through results, Escape closes.
 */
export function NodeSearchPanel({ state, onActivate, onClose }: NodeSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => searchNodes(state, query), [state, query]);
  const activate = useRef(onActivate);

  activate.current = onActivate;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setIndex(0);

    if (matches.length > 0) {
      activate.current(matches[0]);
    }
  }, [matches]);

  const go = (delta: number): void => {
    if (matches.length === 0) {
      return;
    }

    const next = (index + delta + matches.length) % matches.length;

    setIndex(next);
    onActivate(matches[next]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      go(event.shiftKey ? -1 : 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <Panel position="top-center" className="rm-panel rm-search">
      <span className="rm-search__icon">
        <Icon name="search" />
      </span>
      <input
        ref={inputRef}
        className="rm-search__input"
        type="text"
        placeholder="Search nodes"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {hasQuery ? (
        <span className="rm-search__count">{matches.length === 0 ? "0/0" : `${index + 1}/${matches.length}`}</span>
      ) : null}
      <ToolbarButton icon="chevron-up" label="Previous match" disabled={matches.length < 2} onClick={() => go(-1)} />
      <ToolbarButton icon="chevron-down" label="Next match" disabled={matches.length < 2} onClick={() => go(1)} />
      <ToolbarButton icon="x" label="Close search" onClick={onClose} />
    </Panel>
  );
}
