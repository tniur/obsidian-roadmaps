import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_TEXT_ALIGN,
  TEXT_ALIGNS_H,
  TEXT_ALIGNS_V,
  type RoadmapPriority,
  type RoadmapStatus,
} from "../../domain/types";
import { ADD_NODE_ACTIONS, type AddNodeActionId } from "../addNodeActions";
import type { RoadmapCardNode } from "../flow";
import { Icon } from "../Icon";
import { humanizeValue } from "../../domain/title";
import { ALIGN_H_ICONS, ALIGN_V_ICONS, PRIORITY_CHIPS, STATUS_CHIPS } from "./chipOptions";
import type { CanvasMenuActions } from "./menuActions";
import { ChipRow, ColorSwatchRow, SegControl } from "./primitives";

const ADD_ACTION_LABELS: Record<AddNodeActionId, string> = {
  "create-note": "New note",
  "add-note": "Existing note",
  "add-url": "URL",
  "add-image": "Image",
  "add-text": "Text",
  "add-attachment": "Attachment",
};

/**
 * Vertical card menu pinned to a board coordinate by its anchor wrapper, so it travels with the
 * canvas on pan and zoom. Opens down-right, flipping up/left when that would overflow — decided once
 * on mount so it never jitters. Closes on Escape or any press outside.
 */
export function CardMenu({
  title,
  narrow,
  onClose,
  children,
}: {
  title: string;
  narrow?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState({ x: false, y: false });

  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.closest(".rm-canvas");

    if (el === null || !(host instanceof HTMLElement)) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const bounds = host.getBoundingClientRect();

    setFlip({
      x: rect.right > bounds.right - 8 && rect.width < rect.left - bounds.left,
      y: rect.bottom > bounds.bottom - 8 && rect.height < rect.top - bounds.top,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    const onPress = (event: PointerEvent): void => {
      if (el !== null && event.target instanceof Node && !el.contains(event.target)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const transform = `translate(${flip.x ? "calc(-100% - 4px)" : "4px"}, ${flip.y ? "calc(-100% - 4px)" : "4px"})`;

  return (
    <div
      ref={ref}
      className={narrow === true ? "rm-card-menu rm-card-menu--narrow" : "rm-card-menu"}
      style={{ transform }}
    >
      <span className="rm-card-menu__title">{title}</span>
      {children}
    </div>
  );
}

export function CardRow({
  icon,
  label,
  hint,
  trailing,
  danger,
  hero,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  trailing?: ReactNode;
  danger?: boolean;
  hero?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rm-card-menu__item"
      data-danger={danger === true}
      data-hero={hero === true}
      onClick={onClick}
    >
      <span className="rm-card-menu__tile">
        <Icon name={icon} />
      </span>
      <span className="rm-card-menu__text">
        <span className="rm-card-menu__label">{label}</span>
        {hint !== undefined ? <span className="rm-card-menu__hint">{hint}</span> : null}
      </span>
      {trailing}
    </button>
  );
}

/** The six add actions, shared by the empty-canvas and dangling-edge menus. */
export function AddActionRows({ onPick }: { onPick: (action: AddNodeActionId) => void }) {
  return (
    <>
      {ADD_NODE_ACTIONS.map(({ id, icon }) => (
        <CardRow key={id} icon={icon} label={ADD_ACTION_LABELS[id]} onClick={() => onPick(id)} />
      ))}
    </>
  );
}

export interface SelectionSummary {
  status?: RoadmapStatus;
  statusMixed: boolean;
  priority?: RoadmapPriority;
  priorityMixed: boolean;
  color?: string;
  colorMixed: boolean;
  canGroup: boolean;
}

/** Shared values across the selected cards; a differing field reads as "Mixed". */
export function summarizeSelection(nodes: readonly RoadmapCardNode[]): SelectionSummary {
  const pick = <T,>(values: readonly (T | undefined)[]): { value?: T; mixed: boolean } => {
    const first = values[0];
    const mixed = values.some((value) => value !== first);

    return { value: mixed ? undefined : first, mixed };
  };
  const status = pick(nodes.map((node) => node.data.status));
  const priority = pick(nodes.map((node) => node.data.priority));
  const color = pick(nodes.map((node) => node.data.color));

  return {
    status: status.value,
    statusMixed: status.mixed,
    priority: priority.value,
    priorityMixed: priority.mixed,
    color: color.value,
    colorMixed: color.mixed,
    canGroup: nodes.every((node) => node.parentId == null),
  };
}

/**
 * Bulk actions over the selected nodes: grouping, alignment, color and meta chips,
 * duplicate and delete. Every control writes the whole selection in one undo step.
 */
export function SelectionCard({
  ids,
  nodes,
  palette,
  actions,
  onClose,
}: {
  ids: readonly string[];
  nodes: readonly RoadmapCardNode[];
  palette: readonly string[];
  actions: CanvasMenuActions;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<"status" | "priority" | null>(null);
  const summary = summarizeSelection(nodes);
  const align = nodes.length > 0 ? (nodes[0].data.align ?? DEFAULT_TEXT_ALIGN) : DEFAULT_TEXT_ALIGN;
  const done = (run: () => void) => () => {
    run();
    onClose();
  };

  const subValue = (value: string | undefined, mixed: boolean): string =>
    mixed ? "Mixed" : value === undefined ? "None" : humanizeValue(value);

  return (
    <>
      {summary.canGroup ? (
        <CardRow
          icon="group"
          label="Group into cluster"
          hint="Wrap the selection in a new group"
          hero
          onClick={done(() => actions.groupIntoCluster(ids))}
        />
      ) : null}
      <span className="rm-card-menu__divider" />
      <div className="rm-card-menu__section">
        <span className="rm-card-menu__section-label">Align</span>
        <div className="rm-card-menu__segs">
          <SegControl
            options={TEXT_ALIGNS_H.map((value) => ({ value, label: `Align ${value}`, icon: ALIGN_H_ICONS[value] }))}
            current={align.h}
            onPick={(h) => actions.setNodesAlign(ids, { h })}
          />
          <SegControl
            options={TEXT_ALIGNS_V.map((value) => ({ value, label: `Align ${value}`, icon: ALIGN_V_ICONS[value] }))}
            current={align.v}
            onPick={(v) => actions.setNodesAlign(ids, { v })}
          />
        </div>
      </div>
      <div className="rm-card-menu__section">
        <span className="rm-card-menu__section-label">Color</span>
        <ColorSwatchRow
          palette={palette}
          current={summary.colorMixed ? undefined : summary.color}
          onPick={(color, options) => actions.setNodesMeta(ids, { color }, options)}
        />
      </div>
      <span className="rm-card-menu__divider" />
      <CardRow
        icon="circle-check"
        label="Set status"
        trailing={
          <span className="rm-card-menu__value">
            {subValue(summary.status, summary.statusMixed)}
            <Icon name={expanded === "status" ? "chevron-down" : "chevron-right"} />
          </span>
        }
        onClick={() => setExpanded(expanded === "status" ? null : "status")}
      />
      {expanded === "status" ? (
        <div className="rm-card-menu__chips">
          <ChipRow
            options={STATUS_CHIPS}
            current={summary.statusMixed ? undefined : summary.status}
            onToggle={(status) => actions.setNodesMeta(ids, { status })}
          />
        </div>
      ) : null}
      <CardRow
        icon="flag"
        label="Set priority"
        trailing={
          <span className="rm-card-menu__value">
            {subValue(summary.priority, summary.priorityMixed)}
            <Icon name={expanded === "priority" ? "chevron-down" : "chevron-right"} />
          </span>
        }
        onClick={() => setExpanded(expanded === "priority" ? null : "priority")}
      />
      {expanded === "priority" ? (
        <div className="rm-card-menu__chips">
          <ChipRow
            options={PRIORITY_CHIPS}
            current={summary.priorityMixed ? undefined : summary.priority}
            caps
            onToggle={(priority) => actions.setNodesMeta(ids, { priority })}
          />
        </div>
      ) : null}
      <span className="rm-card-menu__divider" />
      <CardRow icon="copy" label="Duplicate" onClick={done(() => actions.duplicateNodes(ids))} />
      <CardRow
        icon="trash-2"
        label="Delete"
        danger
        trailing={<span className="rm-card-menu__value">⌫</span>}
        onClick={done(() => actions.deleteNodes(ids))}
      />
    </>
  );
}
