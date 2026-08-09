import type { RoadmapNodeKind } from "./types";

/** What activating a node does: the double-click gesture and the card's hover affordance. */
export type NodeAction = "preview" | "open" | "edit-text";

/**
 * Board-wide preference for nodes backed by a vault file. Nodes whose content is the board's
 * own (text) or external (url) have no meaningful choice here and ignore it.
 */
const FILE_NODE_ACTIONS = ["preview", "open"] as const;

export type FileNodeAction = (typeof FILE_NODE_ACTIONS)[number];

export const DEFAULT_FILE_NODE_ACTION: FileNodeAction = "preview";

export function isFileNodeAction(value: string): value is FileNodeAction {
  return (FILE_NODE_ACTIONS as readonly string[]).includes(value);
}

const ACTION_ICONS: Record<NodeAction, string> = {
  preview: "eye",
  open: "external-link",
  "edit-text": "pencil",
};

/**
 * The action a node exists for. A locked board cannot edit, so text nodes fall back to
 * reading their content instead.
 */
export function primaryNodeAction(kind: RoadmapNodeKind, fileAction: FileNodeAction, locked: boolean): NodeAction {
  switch (kind) {
    case "text":
      return locked ? "preview" : "edit-text";
    case "url":
      return "open";
    case "note":
    case "heading":
    case "block":
    case "image":
    case "attachment":
      return fileAction;
  }
}

/**
 * The action the primary one displaced, reachable through the modifier gesture and the node
 * menu. Text nodes have none: their content is already on the card.
 */
export function alternateNodeAction(
  kind: RoadmapNodeKind,
  fileAction: FileNodeAction,
  locked: boolean,
): NodeAction | null {
  if (kind === "text") {
    return null;
  }

  return primaryNodeAction(kind, fileAction, locked) === "preview" ? "open" : "preview";
}

/**
 * Ways into a node worth a menu row. In-place editing is left out: the card itself already
 * offers it, both through the gesture and the bubble's edit field.
 */
export function nodeMenuActions(kind: RoadmapNodeKind, fileAction: FileNodeAction, locked: boolean): NodeAction[] {
  const actions = [primaryNodeAction(kind, fileAction, locked), alternateNodeAction(kind, fileAction, locked)];

  return actions.filter((action) => action !== null && action !== "edit-text");
}

export function nodeActionIcon(action: NodeAction): string {
  return ACTION_ICONS[action];
}

/** Menu and tooltip wording; `open` names the destination, which differs per kind. */
export function nodeActionLabel(action: NodeAction, kind: RoadmapNodeKind): string {
  if (action === "preview") {
    return "Open preview";
  }

  if (action === "edit-text") {
    return "Edit text";
  }

  switch (kind) {
    case "url":
      return "Open link";
    case "image":
      return "Open image";
    case "attachment":
      return "Open attachment";
    default:
      return "Open in Obsidian";
  }
}
