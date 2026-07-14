import { STATUS_IN_PROGRESS_ICON_ID } from "../constants";
import type { RoadmapStatus } from "../domain/types";
import { Icon } from "./Icon";
import type { NodeBodyProps } from "./nodeRegistry";

const STATUS_ICONS: Record<RoadmapStatus, string> = {
  draft: "pencil",
  "in-progress": STATUS_IN_PROGRESS_ICON_ID,
  done: "check",
  archived: "archive",
};

/**
 * Status / priority chips shared by node renderers; renders nothing when both are unset.
 * The row flows with the card content and follows its alignment; `overlay` floats it
 * over the image of picture cards instead.
 */
export function NodeBadges({ data, overlay = false }: NodeBodyProps & { overlay?: boolean }) {
  if (data.status === undefined && data.priority === undefined) {
    return null;
  }

  return (
    <div className={overlay ? "rm-node__meta rm-node__meta--overlay" : "rm-node__meta"}>
      {data.priority !== undefined ? (
        <span className="rm-node__badge" data-priority={data.priority}>
          <span className="rm-chip-text">{data.priority}</span>
        </span>
      ) : null}
      {data.status !== undefined ? (
        <span className="rm-node__badge" data-status={data.status}>
          <Icon name={STATUS_ICONS[data.status]} />
          <span className="rm-chip-text">{data.status.replace("-", " ")}</span>
        </span>
      ) : null}
    </div>
  );
}
