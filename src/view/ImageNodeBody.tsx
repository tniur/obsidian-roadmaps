import { Icon } from "./Icon";
import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";

/**
 * Picture card: the image fills the whole box, an optional caption bar is pinned to the
 * bottom and the meta chips float over the top edge. Without a resolvable image the card
 * falls back to a centered placeholder.
 */
export function ImageNodeBody({ data }: NodeBodyProps) {
  const hasTitle = data.customTitle !== undefined && data.customTitle.length > 0;
  const hasDescription = data.description !== undefined && data.description.length > 0;

  if (data.imageSrc === undefined) {
    return (
      <>
        <div className="rm-node__image-fallback">
          <span className="rm-node__fallback-icon">
            <Icon name="image" />
          </span>
          {hasTitle ? <span className="rm-node__title">{data.customTitle}</span> : null}
          <span className="rm-node__fallback-note">Image not found</span>
        </div>
        <NodeBadges data={data} overlay />
      </>
    );
  }

  return (
    <>
      <img className="rm-node__image" src={data.imageSrc} alt="" draggable={false} />
      {hasTitle || hasDescription ? (
        <div className="rm-node__caption">
          {hasTitle ? <span className="rm-node__caption-title">{data.customTitle}</span> : null}
          {hasDescription ? <span className="rm-node__caption-desc">{data.description}</span> : null}
        </div>
      ) : null}
      <NodeBadges data={data} overlay />
    </>
  );
}
