import type { Menu } from "obsidian";
import { colorLabel } from "../../domain/palette";
import { ROADMAP_PRIORITIES, ROADMAP_STATUSES, TEXT_ALIGNS_H, TEXT_ALIGNS_V } from "../../domain/types";
import type { BoardContext } from "../boardContext";
import { promptCustomColor } from "../dialogs";

export interface MenuOption<T> {
  title: string;
  value: T;
}

function labelize(value: string): string {
  const text = value.replace(/-/g, " ");

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function optionsFrom<T extends string>(values: readonly T[], format: (value: T) => string): MenuOption<T>[] {
  return values.map((value) => ({ title: format(value), value }));
}

export const STATUS_OPTIONS = optionsFrom(ROADMAP_STATUSES, labelize);

export const PRIORITY_OPTIONS = optionsFrom(ROADMAP_PRIORITIES, (value) => `${labelize(value)} priority`);

export const ALIGN_H_OPTIONS = optionsFrom(TEXT_ALIGNS_H, (value) => `Align ${value}`);

export const ALIGN_V_OPTIONS = optionsFrom(TEXT_ALIGNS_V, (value) => `Align ${value}`);

/** Prepends a clearing entry, so "no value" renders as a regular checked option. */
export function withNone<T>(title: string, options: readonly MenuOption<T>[]): MenuOption<T | null>[] {
  return [{ title, value: null }, ...options];
}

/** Mutually exclusive options with a check mark on the current value. */
export function addCheckedGroup<T>(
  menu: Menu,
  options: readonly MenuOption<T>[],
  current: T,
  onPick: (value: T) => void,
): void {
  for (const { title, value } of options) {
    menu.addItem((item) =>
      item
        .setTitle(title)
        .setChecked(current === value)
        .onClick(() => onPick(value)),
    );
  }
}

/**
 * Color choices for a node, cluster or edge: the settings palette as a checked group
 * plus a free picker; an assigned color that left the palette reads as custom.
 */
export function addColorGroup(
  menu: Menu,
  ctx: BoardContext,
  current: string | undefined,
  apply: (color: string | null) => void,
): void {
  const palette = [...new Set(ctx.palette)];
  const options = palette.map((value) => ({ title: colorLabel(value), value }));

  addCheckedGroup(menu, withNone("No color", options), current ?? null, apply);
  menu.addItem((item) =>
    item
      .setTitle("Custom color…")
      .setChecked(current !== undefined && !palette.includes(current))
      .onClick(() => promptCustomColor(ctx, current, apply)),
  );
}
