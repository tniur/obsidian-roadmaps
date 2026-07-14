import type { ComponentType } from "react";
import { Icon } from "./Icon";
import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";

/** Type icon + title + optional source line and description. */
export function iconTitleNodeBody(icon: string): ComponentType<NodeBodyProps> {
  return function IconTitleNodeBody({ data }: NodeBodyProps) {
    return (
      <div className="rm-node__content">
        <div className="rm-node__title-row">
          <span className="rm-node__type-icon">
            <Icon name={icon} />
          </span>
          <span className="rm-node__title">{data.displayTitle}</span>
        </div>
        {data.secondary !== undefined ? <span className="rm-node__secondary">{data.secondary}</span> : null}
        {data.description !== undefined ? <p className="rm-node__desc">{data.description}</p> : null}
        <NodeBadges data={data} />
      </div>
    );
  };
}
