/**
 * Task checkboxes rendered by MarkdownRenderer are live inputs, but nothing writes them
 * back to the note. The preview panel maps a clicked checkbox to its source line by
 * order: the nth rendered checkbox is the nth task line found here. The scan mirrors
 * what Obsidian renders as a checkbox — blockquote/callout tasks count, fenced code and
 * frontmatter do not.
 */

const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)(.)\](?=\s|$)/;
const CODE_FENCE = /^\s{0,3}(?:```|~~~)/;

/**
 * Rewrites the mark of the task at `index` (checked = `x`, unchecked = space). Returns
 * null when the task cannot be located or its current mark does not match the state the
 * checkbox had before the click — the rendered checkboxes have diverged from the file,
 * and refusing beats silently toggling the wrong line.
 */
export function setTaskMark(markdown: string, index: number, checked: boolean): string | null {
  const lines = markdown.split("\n");
  let start = 0;

  if (lines[0] === "---") {
    const close = lines.findIndex((line, i) => i > 0 && line === "---");

    if (close > 0) {
      start = close + 1;
    }
  }

  let inFence = false;
  let seen = 0;

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];

    if (CODE_FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const match = TASK_LINE.exec(line);

    if (match === null) {
      continue;
    }

    if (seen < index) {
      seen += 1;
      continue;
    }

    const mark = match[2];

    if (checked ? mark !== " " : mark === " ") {
      return null;
    }

    lines[i] = match[1] + (checked ? "x" : " ") + line.slice(match[1].length + 1);

    return lines.join("\n");
  }

  return null;
}
