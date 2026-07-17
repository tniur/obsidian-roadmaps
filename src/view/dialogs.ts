import { Notice } from "obsidian";
import { normalizeHttpUrl } from "../domain/paths";
import type { RoadmapCluster } from "../domain/types";
import { isReservedHeading } from "../markdown/cluster";
import { sanitizeAlias } from "../markdown/sanitize";
import type { BoardContext } from "./boardContext";
import { PromptModal } from "./PromptModal";

function acceptClusterName(value: string): boolean {
  if (isReservedHeading(value)) {
    new Notice(`"${value}" is a reserved section name.`);

    return false;
  }

  return true;
}

/** Tells the user when a taken title came back with a numeric suffix. */
function reportSuffixedTitle(requested: string, actual: string | null): void {
  if (actual !== null && actual !== sanitizeAlias(requested)) {
    new Notice(`Title already in use — cluster named "${actual}".`);
  }
}

export function promptRenameCluster(ctx: BoardContext, cluster: RoadmapCluster): void {
  new PromptModal(ctx.app, {
    title: "Cluster name",
    placeholder: "Cluster",
    initialValue: cluster.title,
    cta: "Rename",
    onSubmit: (value) => {
      if (value.length === 0 || !acceptClusterName(value)) {
        return;
      }

      reportSuffixedTitle(value, ctx.session.renameCluster(cluster.id, value));
      ctx.commit();
    },
  }).open();
}

/** Wraps the given nodes into a new named cluster; already clustered ones are skipped. */
export function promptGroupIntoCluster(ctx: BoardContext, nodeIds: readonly string[]): void {
  const targets = nodeIds.filter((id) => ctx.session.state.nodes[id]?.clusterId == null);

  if (targets.length === 0) {
    return;
  }

  new PromptModal(ctx.app, {
    title: "Cluster name",
    placeholder: "Cluster",
    cta: "Group",
    onSubmit: (value) => {
      if (!acceptClusterName(value)) {
        return;
      }

      const requested = value.length > 0 ? value : "Cluster";

      reportSuffixedTitle(requested, ctx.session.createClusterFromNodes(targets, requested));
      ctx.commit();
    },
  }).open();
}

export function promptNodeText(ctx: BoardContext, id: string, field: "title" | "description"): void {
  const node = ctx.session.state.nodes[id];

  if (node === undefined) {
    return;
  }

  new PromptModal(ctx.app, {
    title: field === "title" ? "Node title" : "Node description",
    placeholder: field === "title" ? "Title (empty uses the file name)" : "Description",
    initialValue: (field === "title" ? node.title : node.description) ?? "",
    cta: "Save",
    onSubmit: (value) => {
      ctx.session.updateNodeMeta(id, { [field]: value });
      ctx.commit();
    },
  }).open();
}

/** Inline text nodes keep their content in `title`; unlike meta text it must stay non-empty. */
export function promptEditText(ctx: BoardContext, id: string): void {
  const node = ctx.session.state.nodes[id];

  if (node === undefined || node.source.type !== "text") {
    return;
  }

  new PromptModal(ctx.app, {
    title: "Edit text",
    placeholder: "Text",
    initialValue: node.title ?? "",
    cta: "Save",
    onSubmit: (value) => {
      if (value.length === 0) {
        return;
      }

      ctx.session.updateNodeMeta(id, { title: value });
      ctx.commit();
    },
  }).open();
}

export function promptNodeUrl(ctx: BoardContext, id: string): void {
  const node = ctx.session.state.nodes[id];

  if (node === undefined || node.source.type !== "url") {
    return;
  }

  new PromptModal(ctx.app, {
    title: "Node URL",
    placeholder: "https://example.com",
    initialValue: node.source.url,
    cta: "Save",
    onSubmit: (value) => {
      if (value.length === 0) {
        return;
      }

      ctx.session.setNodeUrl(id, normalizeHttpUrl(value));
      ctx.commit();
    },
  }).open();
}

export function promptEdgeLabel(ctx: BoardContext, id: string): void {
  const edge = ctx.session.state.edges[id];

  if (edge === undefined) {
    return;
  }

  new PromptModal(ctx.app, {
    title: edge.label === undefined ? "Add edge label" : "Edit edge label",
    placeholder: "Label text",
    initialValue: edge.label ?? "",
    cta: "Save",
    onSubmit: (value) => {
      ctx.session.updateEdge(id, { label: value });
      ctx.commit();
    },
  }).open();
}
