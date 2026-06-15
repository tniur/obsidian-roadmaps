import { Icon } from "./Icon";
import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";

export function UrlNodeBody({ data }: NodeBodyProps) {
  return (
    <>
      <div className="rm-node__title-row">
        <span className="rm-node__type-icon">
          <Icon name="link" />
        </span>
        <span className="rm-node__title">{data.label}</span>
      </div>
      {data.description !== undefined ? <p className="rm-node__desc">{data.description}</p> : null}
      <NodeBadges data={data} />
    </>
  );
}
