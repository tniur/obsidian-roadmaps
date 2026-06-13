import type { NodeBodyProps } from "./nodeRegistry";

export function NoteNodeBody({ data }: NodeBodyProps) {
  return (
    <>
      <span className="rm-node__title">{data.label}</span>
      {data.description !== undefined ? <p className="rm-node__desc">{data.description}</p> : null}
      {data.status !== undefined || data.priority !== undefined ? (
        <div className="rm-node__meta">
          {data.status !== undefined ? (
            <span className="rm-node__badge" data-status={data.status}>
              {data.status}
            </span>
          ) : null}
          {data.priority !== undefined ? (
            <span className="rm-node__badge" data-priority={data.priority}>
              {data.priority}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
