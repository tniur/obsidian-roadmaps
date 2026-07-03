import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";

export function NoteNodeBody({ data }: NodeBodyProps) {
  return (
    <>
      <span className="rm-node__title">{data.displayTitle}</span>
      {data.description !== undefined ? <p className="rm-node__desc">{data.description}</p> : null}
      <NodeBadges data={data} />
    </>
  );
}
