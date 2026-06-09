import { ROADMAP_FRONTMATTER_KEY, ROADMAP_FRONTMATTER_VALUE } from "../constants";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRoadmapFile(content: string): boolean {
  const frontmatter = FRONTMATTER_RE.exec(content);
  if (frontmatter === null) {
    return false;
  }
  const keyRe = new RegExp(`^${escapeRegExp(ROADMAP_FRONTMATTER_KEY)}:[ \\t]*(.+?)[ \\t]*$`, "m");
  const line = keyRe.exec(frontmatter[1]);
  if (line === null) {
    return false;
  }
  const value = line[1].replace(/^["']|["']$/g, "");

  return value === ROADMAP_FRONTMATTER_VALUE;
}

export function createRoadmapDocument(title: string): string {
  const frontmatter = [
    "---",
    `${ROADMAP_FRONTMATTER_KEY}: ${ROADMAP_FRONTMATTER_VALUE}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${title}\n`;
}
