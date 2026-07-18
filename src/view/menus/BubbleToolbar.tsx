import { Fragment, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../Icon";

export interface BubbleItem {
  id: string;
  label: string;
  icon?: string;
  /** Renders the button as a color dot instead of an icon; `color` may be unset. */
  dot?: { color?: string };
  disabled?: boolean;
  /** Direct action; mutually exclusive with `flyout`. */
  run?: () => void;
  /** `close` dismisses the flyout, e.g. after an input commits on Enter. */
  flyout?: (close: () => void) => ReactNode;
  flyoutKind?: "card" | "tight" | "wide";
}

export type BubbleGroup = readonly BubbleItem[];

/**
 * Floating toolbar bubble above the selected node, edge or cluster: icon buttons in
 * groups with dividers, a caret pointing at the target, and at most one click-toggled
 * flyout card opening above the strip. Escape closes the open flyout.
 */
export function BubbleToolbar({ groups }: { groups: readonly BubbleGroup[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const items = groups.flat();
  const active = items.find((item) => item.id === open);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape" && open !== null) {
      event.stopPropagation();
      setOpen(null);
    }
  };

  return (
    <div className="rm-bubble" onKeyDown={onKeyDown}>
      {active?.flyout !== undefined ? (
        <div className={`rm-bubble__flyout rm-bubble__flyout--${active.flyoutKind ?? "card"}`}>
          {active.flyout(() => setOpen(null))}
        </div>
      ) : null}
      <div className="rm-bubble__bar">
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 ? <span className="rm-bubble__divider" /> : null}
            {group.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rm-bubble__btn"
                data-active={item.id === open}
                aria-pressed={item.flyout === undefined ? undefined : item.id === open}
                disabled={item.disabled === true}
                aria-label={item.label}
                title={item.label}
                onClick={() => {
                  if (item.run !== undefined) {
                    setOpen(null);
                    item.run();
                  } else {
                    setOpen(item.id === open ? null : item.id);
                  }
                }}
              >
                {item.dot !== undefined ? (
                  <span
                    className="rm-bubble__dot"
                    data-empty={item.dot.color === undefined}
                    style={
                      item.dot.color === undefined ? undefined : ({ "--rm-swatch": item.dot.color } as CSSProperties)
                    }
                  />
                ) : (
                  <Icon name={item.icon ?? "circle"} />
                )}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
      <span className="rm-bubble__caret" />
    </div>
  );
}

export function MoreRow({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="rm-menu__row" data-danger={danger === true} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
