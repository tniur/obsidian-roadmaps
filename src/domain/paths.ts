/** File name without directories and extension; the default title of file-backed nodes. */
export function fileBasename(path: string): string {
  const file = path.split("/").pop() ?? path;

  return file.replace(/\.[^.]+$/, "");
}

/** Wikilink targets omit the implied `.md`; any other extension stays visible. */
export function stripMarkdownExtension(path: string): string {
  return path.replace(/\.md$/, "");
}

/** Hostname as the default title of URL nodes; malformed URLs fall back to the raw text. */
export function urlHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
