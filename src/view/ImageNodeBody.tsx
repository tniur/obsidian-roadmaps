import { Icon } from "./Icon";
import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";

export function ImageNodeBody({ data }: NodeBodyProps) {
  const hasTitle = data.title !== undefined && data.title.length > 0;
  const hasDescription = data.description !== undefined && data.description.length > 0;
  const showHeader = data.imageSrc === undefined || hasTitle || hasDescription;

  return (
    <>
      {data.imageSrc !== undefined ? (
        <img className="rm-node__image" src={data.imageSrc} alt="" draggable={false} />
      ) : null}
      {showHeader ? (
        <div className="rm-node__title-row">
          <span className="rm-node__type-icon">
            <Icon name="image" />
          </span>
          {hasTitle ? <span className="rm-node__title">{data.title}</span> : null}
        </div>
      ) : null}
      {hasDescription ? <p className="rm-node__desc">{data.description}</p> : null}
      <NodeBadges data={data} />
    </>
  );
}
