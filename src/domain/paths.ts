/** File name without directories and extension; the default title of file-backed nodes. */
export function fileBasename(path: string): string {
  const file = path.split("/").pop() ?? path;

  return file.replace(/\.[^.]+$/, "");
}

/** Last path segment with its extension kept; the source line of attachment cards. */
export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Wikilink targets omit the implied `.md`; any other extension stays visible. */
export function stripMarkdownExtension(path: string): string {
  return path.replace(/\.md$/, "");
}

/** Human-readable file size for the attachment card's source line: "2.4 MB", "312 KB". */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  let rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;

  if (rounded >= 1024 && unit < units.length - 1) {
    rounded = Math.round(rounded / 1024);
    unit += 1;
  }

  return `${rounded} ${units[unit]}`;
}

const SAFE_URL_RE = /^(https?|obsidian):\/\//i;

/** Only http(s) and obsidian URLs are opened or auto-linked; other schemes are rejected. */
export function isSafeUrl(url: string): boolean {
  return SAFE_URL_RE.test(url);
}

/** User-entered addresses default to https when no accepted scheme is given. */
export function normalizeHttpUrl(value: string): string {
  return isSafeUrl(value) ? value : `https://${value}`;
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
  const name = fileName(path);
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
