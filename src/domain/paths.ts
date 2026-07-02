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

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);

/** Node kind implied by a vault path: image by extension, note for `.md` and
 * extension-less wikilink targets, attachment for anything else. */
export function fileKindForPath(path: string): "note" | "image" | "attachment" {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");

  if (dot === -1) {
    return "note";
  }

  const extension = name.slice(dot + 1).toLowerCase();

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  return extension === "md" ? "note" : "attachment";
}
