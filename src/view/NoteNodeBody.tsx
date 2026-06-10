import type { CSSProperties } from "react";
import type { NodeBodyProps } from "./nodeRegistry";

export function NoteNodeBody({ data }: NodeBodyProps) {
  const accent: CSSProperties | undefined =
    typeof data.color === "string"
      ? ({ "--rm-node-accent": data.color } as CSSProperties)
      : undefined;

  return (
    <>
      <div className="rm-node__header">
        {accent !== undefined ? <span className="rm-node__swatch" style={accent} /> : null}
        <span className="rm-node__title">{data.label}</span>
      </div>
      {data.description !== undefined ? <p className="rm-node__desc">{data.description}</p> : null}
      {data.status !== undefined ? (
        <span className="rm-node__status" data-status={data.status}>
          {data.status}
        </span>
      ) : null}
    </>
  );
}
