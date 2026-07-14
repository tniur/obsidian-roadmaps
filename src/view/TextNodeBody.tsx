import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";

export function TextNodeBody({ data }: NodeBodyProps) {
  return (
    <div className="rm-node__content">
      <div className="rm-node__text">{data.displayTitle}</div>
      {data.description !== undefined ? <p className="rm-node__desc">{data.description}</p> : null}
      <NodeBadges data={data} />
    </div>
  );
}
