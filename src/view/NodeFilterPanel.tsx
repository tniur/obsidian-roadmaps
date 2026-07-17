import { Panel } from "@xyflow/react";
import { useEffect, type CSSProperties } from "react";
import { FILTER_NONE } from "../domain/filter";
import { ROADMAP_PRIORITIES, ROADMAP_STATUSES } from "../domain/types";
import { humanizeValue } from "../domain/title";
import { ToolbarButton } from "./ToolbarButton";

type ChipKind = "status" | "priority";

interface Chip {
  value: string;
  label: string;
  /** Design token for this value's colour, or undefined for the `none` chip. */
  color?: string;
}

/** Chips for a category, derived from the domain literals plus a trailing "no value" chip. */
function chipsFor(kind: ChipKind, values: readonly string[], noneLabel: string): Chip[] {
  return [
    ...values.map((value) => ({ value, label: humanizeValue(value), color: `var(--rm-${kind}-${value})` })),
    { value: FILTER_NONE, label: noneLabel },
  ];
}

const STATUS_CHIPS = chipsFor("status", ROADMAP_STATUSES, "No status");

const PRIORITY_CHIPS = chipsFor("priority", ROADMAP_PRIORITIES, "No priority");

interface NodeFilterPanelProps {
  statuses: ReadonlySet<string>;
  priorities: ReadonlySet<string>;
  onToggle: (kind: ChipKind, value: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Top-centred filter bar: toggle status/priority chips to dim non-matching nodes. Chips are
 * OR within a category and AND across categories; the `none` chip covers nodes without a value.
 */
export function NodeFilterPanel({ statuses, priorities, onToggle, onClear, onClose }: NodeFilterPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const active = statuses.size > 0 || priorities.size > 0;

  const renderChips = (kind: ChipKind, chips: readonly Chip[], selected: ReadonlySet<string>) =>
    chips.map((chip) => (
      <button
        key={chip.value}
        type="button"
        className="rm-filter__chip"
        data-active={selected.has(chip.value)}
        style={chip.color === undefined ? undefined : ({ "--rm-chip-color": chip.color } as CSSProperties)}
        onClick={() => onToggle(kind, chip.value)}
      >
        {chip.label}
      </button>
    ));

  return (
    <Panel position="top-center" className="rm-panel rm-filter">
      <div className="rm-filter__row">
        <span className="rm-filter__label">Status</span>
        <div className="rm-filter__chips">{renderChips("status", STATUS_CHIPS, statuses)}</div>
      </div>
      <div className="rm-filter__row">
        <span className="rm-filter__label">Priority</span>
        <div className="rm-filter__chips">{renderChips("priority", PRIORITY_CHIPS, priorities)}</div>
      </div>
      <div className="rm-filter__footer">
        <button type="button" className="rm-filter__clear" disabled={!active} onClick={onClear}>
          Clear
        </button>
        <ToolbarButton icon="x" label="Close filter" onClick={onClose} />
      </div>
    </Panel>
  );
}
