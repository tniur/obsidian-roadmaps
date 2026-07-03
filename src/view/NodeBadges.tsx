import type { NodeBodyProps } from "./nodeRegistry";

/** Status / priority badges shared by node renderers. Renders nothing when both are unset. */
export function NodeBadges({ data }: NodeBodyProps) {
  if (data.status === undefined && data.priority === undefined) {
    return null;
  }

  return (
    <div className="rm-node__meta">
      {data.status !== undefined ? (
        <span className="rm-node__badge" data-status={data.status}>
          {data.status.replace("-", " ")}
        </span>
      ) : null}
      {data.priority !== undefined ? (
        <span className="rm-node__badge" data-priority={data.priority}>
          {data.priority}
        </span>
      ) : null}
    </div>
  );
}
