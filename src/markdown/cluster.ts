import type { RoadmapCluster } from "../domain/types";
import { attrColor, MARKER_ATTRS_PATTERN, parseMarkerAttrs, renderMarkerAttrs } from "./markerAttrs";

/** Headings that are structural sections of the roadmap file, never clusters. */
export const RESERVED_SECTIONS = new Set(["Relations", "Archive"]);

const CLUSTER_MARKER_RE = new RegExp(`<!-- roadmap-cluster:id=(\\S+)${MARKER_ATTRS_PATTERN} -->`);

const HEADING_RE = /^##\s+(.*)$/;

export function renderClusterHeading(cluster: RoadmapCluster): string {
  const attrs = renderMarkerAttrs([["color", cluster.style?.color]]);

  return `## ${cluster.title} <!-- roadmap-cluster:id=${cluster.id}${attrs} -->`;
}

export interface ParsedClusterHeading {
  id: string | null;
  title: string;
  color?: string;
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
  const result: ParsedClusterHeading = { id, title };
  const color = marker === null ? undefined : attrColor(parseMarkerAttrs(marker[2]).color);

  if (color !== undefined) {
    result.color = color;
  }

  return result;
}

export function isReservedHeading(text: string): boolean {
  return RESERVED_SECTIONS.has(text.trim());
}
