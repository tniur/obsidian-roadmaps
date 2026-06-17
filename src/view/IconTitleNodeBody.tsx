import type { ComponentType } from "react";
import { Icon } from "./Icon";
import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";

/** Type icon + title + optional description + badges, shared by file-like and link nodes. */
export function iconTitleNodeBody(icon: string): ComponentType<NodeBodyProps> {
  return function IconTitleNodeBody({ data }: NodeBodyProps) {
    return (
      <>
        <div className="rm-node__title-row">
          <span className="rm-node__type-icon">
            <Icon name={icon} />
          </span>
          <span className="rm-node__title">{data.label}</span>
        </div>
        {data.description !== undefined ? (
          <p className="rm-node__desc">{data.description}</p>
        ) : null}
        <NodeBadges data={data} />
      </>
    );
  };
}
