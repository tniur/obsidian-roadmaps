import type { RoadmapCluster } from "../domain/types";

/** Headings that are structural sections of the roadmap file, never clusters. */
export const RESERVED_SECTIONS = new Set(["Relations", "Archive"]);

const CLUSTER_MARKER_RE = /<!-- roadmap-cluster:id=(\S+) -->/;

const HEADING_RE = /^##\s+(.*)$/;

export function renderClusterHeading(cluster: RoadmapCluster): string {
  return `## ${cluster.title} <!-- roadmap-cluster:id=${cluster.id} -->`;
}

export interface ParsedClusterHeading {
  id: string | null;
  title: string;
}

/** Parses a `## ...` line into a cluster heading, or null if it is not a `##` heading. */
export function parseClusterHeading(line: string): ParsedClusterHeading | null {
  const heading = HEADING_RE.exec(line);

  if (heading === null) {
    return null;
  }

  const marker = CLUSTER_MARKER_RE.exec(line);
  const id = marker === null ? null : marker[1];
  const title = heading[1].replace(CLUSTER_MARKER_RE, "").trim();

  return { id, title };
}

export function isReservedHeading(text: string): boolean {
  return RESERVED_SECTIONS.has(text.trim());
}
