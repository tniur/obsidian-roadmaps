import { nodeTitle } from "../domain/title";
import type { RoadmapEndpoint, RoadmapState } from "../domain/types";

const RELATIONS_HEADING = "## Relations";

function stripExtension(path: string): string {
  return path.replace(/\.md$/, "");
}

function endpointLink(state: RoadmapState, endpoint: RoadmapEndpoint): string | null {
  if (endpoint.type === "cluster") {
    const cluster = state.clusters[endpoint.id];

    return cluster === undefined ? null : `[[#${cluster.title}]]`;
  }

  const node = state.nodes[endpoint.id];

  if (node === undefined) {
    return null;
  }

  const title = nodeTitle(node);
  const source = node.source;

  switch (source.type) {
    case "note":
      return `[[${stripExtension(source.file)}|${title}]]`;
    case "heading":
      return `[[${stripExtension(source.file)}#${source.heading}|${title}]]`;
    case "block":
      return `[[${stripExtension(source.file)}#^${source.blockId}|${title}]]`;
    case "image":
    case "attachment":
      return `[[${source.file}|${title}]]`;
    case "url":
      return `[${title}](${source.url})`;
    case "text":
      return title;
  }
}

export function renderRelationsSection(state: RoadmapState): string | null {
  const lines: string[] = [];

  for (const edge of Object.values(state.edges)) {
    const from = endpointLink(state, edge.from);
    const to = endpointLink(state, edge.to);

    if (from === null || to === null) {
      continue;
    }

    const arrow = edge.direction === "both" ? "<->" : edge.direction === "forward" ? "->" : "--";
    const label = edge.label !== undefined && edge.label.length > 0 ? `: ${edge.label}` : "";

    lines.push(`- ${from} ${arrow} ${to}${label} <!-- roadmap-edge:id=${edge.id} -->`);
  }

  if (lines.length === 0) {
    return null;
  }

  return [RELATIONS_HEADING, "", ...lines].join("\n");
}
