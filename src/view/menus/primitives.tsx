import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { colorLabel, FALLBACK_CUSTOM_COLOR, isHexColor, normalizeHexColor } from "../../domain/palette";
import { Icon } from "../Icon";

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

/** Segmented control: one always-active value out of a small mutually exclusive set. */
export function SegControl<T extends string>({
  options,
  current,
  onPick,
}: {
  options: readonly SegOption<T>[];
  current: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="rm-menu__seg">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="rm-menu__seg-btn"
          data-active={option.value === current}
          aria-pressed={option.value === current}
          aria-label={option.label}
          title={option.label}
          onClick={() => onPick(option.value)}
        >
          {option.icon !== undefined ? <Icon name={option.icon} /> : option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Custom-color swatch hosting the native color input, so a click opens the system
 * picker directly. Every `input` tick applies live — the board previews the color as
 * the user drags — but only the first tick of a gesture records an undo snapshot
 * (`history: true`); the rest ride on top, so the whole pick stays one undo step.
 * Closing the picker (`change`) ends the gesture; reopening starts a new one.
 */
function CustomSwatch({
  current,
  onPick,
}: {
  current: string | undefined;
  onPick: (color: string, options: { history: boolean }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onPickRef = useRef(onPick);
  const gestureRef = useRef(false);
  const active = current !== undefined;
  const seed = active && isHexColor(current) ? normalizeHexColor(current) : FALLBACK_CUSTOM_COLOR;
  const seedRef = useRef(seed);

  onPickRef.current = onPick;
  seedRef.current = seed;

  useEffect(() => {
    const input = inputRef.current;

    if (input === null) {
      return;
    }

    let last: string | null = null;
    const deliver = (): void => {
      const color = normalizeHexColor(input.value);

      if (color === (last ?? seedRef.current)) {
        return;
      }

      last = color;
      onPickRef.current(color, { history: !gestureRef.current });
      gestureRef.current = true;
    };
    const finish = (): void => {
      deliver();
      gestureRef.current = false;
      last = null;
    };

    input.addEventListener("input", deliver);
    input.addEventListener("change", finish);

    return () => {
      input.removeEventListener("input", deliver);
      input.removeEventListener("change", finish);
    };
  }, []);

  useEffect(() => {
    const input = inputRef.current;

    if (input !== null && !gestureRef.current) {
      input.value = seed;
    }
  }, [seed]);

  return (
    <label
      className="rm-menu__swatch rm-menu__swatch--custom"
      data-active={active}
      style={active ? ({ "--rm-swatch": current } as CSSProperties) : undefined}
      title="Custom color"
    >
      <input
        ref={inputRef}
        className="rm-menu__swatch-input"
        type="color"
        defaultValue={seed}
        aria-label="Custom color"
      />
      {active ? null : <Icon name="plus" />}
    </label>
  );
}

/**
 * Palette swatches with a leading "no color" slash swatch and a trailing custom-color
 * swatch that opens the system picker in place. `current` outside the palette renders
 * as the custom swatch's color. The picker's live ticks forward `history: false` after
 * the first, so a drag through colors lands as a single undo step.
 */
export function ColorSwatchRow({
  palette,
  current,
  onPick,
}: {
  palette: readonly string[];
  current: string | undefined;
  onPick: (color: string | null, options?: { history?: boolean }) => void;
}) {
  const unique = [...new Set(palette)];
  const custom = current !== undefined && !unique.includes(current);

  return (
    <div className="rm-menu__swatches">
      <button
        type="button"
        className="rm-menu__swatch rm-menu__swatch--none"
        data-active={current === undefined}
        aria-pressed={current === undefined}
        aria-label="No color"
        title="No color"
        onClick={() => onPick(null)}
      />
      {unique.map((color) => (
        <button
          key={color}
          type="button"
          className="rm-menu__swatch"
          data-active={color === current}
          aria-pressed={color === current}
          style={{ "--rm-swatch": color } as CSSProperties}
          aria-label={colorLabel(color)}
          title={colorLabel(color)}
          onClick={() => onPick(color)}
        />
      ))}
      <CustomSwatch current={custom ? current : undefined} onPick={onPick} />
    </div>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
  /** CSS color the active chip tints itself with. */
  color: string;
}

/** Toggle chips: clicking the active value clears it (the canon has no explicit "none"). */
export function ChipRow<T extends string>({
  options,
  current,
  caps,
  onToggle,
}: {
  options: readonly ChipOption<T>[];
  current: T | undefined;
  caps?: boolean;
  onToggle: (value: T | null) => void;
}) {
  return (
    <div className="rm-menu__chips">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="rm-menu__chip"
          data-active={option.value === current}
          aria-pressed={option.value === current}
          data-caps={caps === true}
          style={{ "--rm-chip-color": option.color } as CSSProperties}
          onClick={() => onToggle(option.value === current ? null : option.value)}
        >
          {option.icon !== undefined ? <Icon name={option.icon} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Flyout text field committing on Enter or blur; Escape restores the last committed
 * value instead. Uncontrolled between commits, so typing never spams the undo stack.
 */
export function CommitField({
  label,
  value,
  placeholder,
  multiline,
  onCommit,
  onDone,
}: {
  /** Field caption; omit in single-field flyouts, where the section label already names it. */
  label?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
  /** Invoked after an Enter commit, e.g. to close the containing flyout. */
  onDone?: () => void;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (): void => {
    if (draft !== value) {
      onCommit(draft.trim());
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      ref.current?.blur();
      onDone?.();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setDraft(value);
      ref.current?.blur();
    }
  };

  return (
    <label className="rm-menu__field">
      {label !== undefined ? <span className="rm-menu__field-label">{label}</span> : null}
      {multiline === true ? (
        <textarea
          ref={(el) => {
            ref.current = el;
          }}
          className="rm-menu__input rm-menu__input--area"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      ) : (
        <input
          ref={(el) => {
            ref.current = el;
          }}
          className="rm-menu__input"
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      )}
    </label>
  );
}

export function FlyoutSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rm-menu__section">
      <span className="rm-menu__section-label">{label}</span>
      {children}
    </div>
  );
}
