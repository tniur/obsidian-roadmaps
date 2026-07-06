/**
 * Optional `key=value` attributes carried by hidden markers. They mirror presentation
 * fields whose canonical home is the state block (color, alignment, edge style), so a
 * rebuild from the readable body can restore them. Values must be single tokens — the
 * marker grammar splits on whitespace — and unknown or malformed entries are ignored.
 */

export type MarkerAttrs = Record<string, string>;

/** Attrs capture group for marker regexes: zero or more ` key=value` tokens. */
export const MARKER_ATTRS_PATTERN = "((?: \\S+=\\S+)*)";

export function renderMarkerAttrs(attrs: ReadonlyArray<readonly [string, string | undefined]>): string {
  return attrs
    .filter((pair): pair is readonly [string, string] => pair[1] !== undefined && !/\s/.test(pair[1]))
    .map(([key, value]) => ` ${key}=${value}`)
    .join("");
}

export function parseMarkerAttrs(raw: string | undefined): MarkerAttrs {
  const attrs: MarkerAttrs = {};

  if (raw === undefined) {
    return attrs;
  }

  for (const token of raw.trim().split(/\s+/)) {
    const eq = token.indexOf("=");

    if (eq > 0) {
      attrs[token.slice(0, eq)] = token.slice(eq + 1);
    }
  }

  return attrs;
}

/** Restricts an attr to a known literal set; anything else reads as absent. */
export function attrIn<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return value !== undefined && (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

const COLOR_VALUE_RE = /^[\w#(),.%-]+$/;

/** CSS color tokens only (`var(--x)`, `#hex`, `rgb(...)`) — free-form values are dropped. */
export function attrColor(value: string | undefined): string | undefined {
  return value !== undefined && COLOR_VALUE_RE.test(value) ? value : undefined;
}
