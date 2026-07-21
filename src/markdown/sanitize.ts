/**
 * User-entered text is written next to structural syntax (comment markers, the `%% roadmap:state %%`
 * fence, wikilinks, headings); these helpers keep it from being parsed as structure. State stays
 * canonical for meta fields, so the lossy replacements here only affect the readable mirror.
 */

const STRUCTURAL_SEQUENCES = /<!--|-->|%%/g;

/** Single-line readable fragment: collapses line breaks, strips marker/fence sequences. */
export function sanitizeInline(value: string): string {
  return value
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(STRUCTURAL_SEQUENCES, "")
    .trim();
}

/** Text placed inside `[[target|alias]]` or `[text](url)`: also neutralizes link syntax. */
export function sanitizeAlias(value: string): string {
  return sanitizeInline(value).replace(/\[/g, "(").replace(/\]/g, ")").replace(/\|/g, "/");
}

/**
 * Inline text node content is canonical in the body, so it must survive a write/read round-trip. A
 * leading `#` would turn the line into a heading, so it is backslash-escaped; marker and fence
 * sequences have no such escape and are stripped.
 */
export function escapeTextContent(value: string): string {
  return value
    .replace(STRUCTURAL_SEQUENCES, "")
    .split("\n")
    .map((line) => (line.startsWith("#") ? `\\${line}` : line))
    .join("\n");
}

export function unescapeTextContent(value: string): string {
  return value
    .split("\n")
    .map((line) => (line.startsWith("\\#") ? line.slice(1) : line))
    .join("\n");
}

/** Spaces and parentheses would end a `[text](url)` target early; encode them. */
export function encodeMarkdownUrl(url: string): string {
  return url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
