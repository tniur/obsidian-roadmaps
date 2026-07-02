/**
 * User-entered text is written into the roadmap file next to structural syntax (hidden
 * comment markers, the `%% roadmap:state %%` fence, wikilinks, headings). These helpers
 * keep such text from being parsed as structure. State stays canonical for meta fields,
 * so lossy replacements here only affect the readable mirror.
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
 * Inline text node content is canonical in the body, so it must survive a write/read
 * round-trip. A leading `#` would turn the line into a heading (a cluster/section
 * boundary), so it is escaped with the standard Markdown backslash; marker and fence
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
