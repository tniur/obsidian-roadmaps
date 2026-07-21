/**
 * Entity colors are plain CSS values: an Obsidian theme token (`var(--color-red)`) that adapts to
 * the theme, or a fixed hex the user picked. The palette offered in color menus is configurable in
 * settings; entities keep their assigned value even after it leaves the palette.
 */

const THEME_COLOR_NAMES = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const;

export const DEFAULT_PALETTE: readonly string[] = THEME_COLOR_NAMES.map((name) => `var(--color-${name})`);

/** Starting value for a freshly added custom color, meant to be adjusted right away. */
export const FALLBACK_CUSTOM_COLOR = "#808080";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

const THEME_COLOR_RE = /^var\(--color-([a-z]+)\)$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

export function normalizeHexColor(value: string): string {
  return isHexColor(value) ? value.toLowerCase() : value;
}

/** Human label for a palette entry: theme tokens by name, custom colors as hex. */
export function colorLabel(value: string): string {
  const name = THEME_COLOR_RE.exec(value)?.[1];

  if (name === undefined) {
    return value.toUpperCase();
  }

  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Palette as loaded from settings: only known theme tokens and hex values survive,
 * hex is normalized to lowercase, duplicates collapse. Anything that is not an array
 * (missing or corrupt data) falls back to the default palette.
 */
export function sanitizePalette(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PALETTE];
  }

  const palette = value
    .filter((entry): entry is string => typeof entry === "string")
    .map(normalizeHexColor)
    .filter((entry) => isHexColor(entry) || DEFAULT_PALETTE.includes(entry));

  return [...new Set(palette)];
}
