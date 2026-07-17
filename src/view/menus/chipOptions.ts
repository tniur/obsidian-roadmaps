import { humanizeValue } from "../../domain/title";
import {
  ROADMAP_PRIORITIES,
  ROADMAP_STATUSES,
  type RoadmapPriority,
  type RoadmapStatus,
  type TextAlignH,
  type TextAlignV,
} from "../../domain/types";
import { STATUS_ICONS } from "../NodeBadges";
import type { ChipOption } from "./primitives";

export const STATUS_CHIPS: readonly ChipOption<RoadmapStatus>[] = ROADMAP_STATUSES.map((value) => ({
  value,
  label: humanizeValue(value),
  icon: STATUS_ICONS[value],
  color: `var(--rm-status-${value})`,
}));

export const PRIORITY_CHIPS: readonly ChipOption<RoadmapPriority>[] = ROADMAP_PRIORITIES.map((value) => ({
  value,
  label: value,
  color: `var(--rm-priority-${value})`,
}));

export const ALIGN_H_ICONS: Record<TextAlignH, string> = {
  left: "align-left",
  center: "align-center",
  right: "align-right",
};

export const ALIGN_V_ICONS: Record<TextAlignV, string> = {
  top: "align-vertical-justify-start",
  middle: "align-vertical-justify-center",
  bottom: "align-vertical-justify-end",
};
