import type { NodePlacement } from "../domain/create";
import {
  addExistingAttachment,
  addExistingImage,
  addExistingNote,
  addTextNode,
  addUrlNode,
  createNewNote,
  type NodeSink,
} from "./addNode";
import type { BoardContext } from "./boardContext";

export type AddNodeActionId = "create-note" | "add-note" | "add-url" | "add-image" | "add-text" | "add-attachment";

export interface AddNodeAction {
  id: AddNodeActionId;
  label: string;
  icon: string;
  run: (ctx: BoardContext, folder: string | undefined, placement: NodePlacement, sink?: NodeSink) => void;
}

/**
 * Single source for the ways to put a node on the board. Palette commands, the canvas
 * context menu and the node toolbar all render from this list, so a new node type is
 * wired in one place. `folder` targets note creation next to the roadmap file; actions
 * picking an existing source ignore it. `sink` overrides what happens to the built node
 * (default: standalone insert).
 */
export const ADD_NODE_ACTIONS: readonly AddNodeAction[] = [
  {
    id: "create-note",
    label: "Create new note",
    icon: "file-plus",
    run: (ctx, folder, placement, sink) => {
      void createNewNote(ctx, folder, placement, sink);
    },
  },
  {
    id: "add-note",
    label: "Add existing note",
    icon: "search",
    run: (ctx, _folder, placement, sink) => addExistingNote(ctx, placement, sink),
  },
  {
    id: "add-url",
    label: "Add URL",
    icon: "link",
    run: (ctx, _folder, placement, sink) => addUrlNode(ctx, placement, sink),
  },
  {
    id: "add-image",
    label: "Add image",
    icon: "image",
    run: (ctx, _folder, placement, sink) => addExistingImage(ctx, placement, sink),
  },
  {
    id: "add-text",
    label: "Add text",
    icon: "type",
    run: (ctx, _folder, placement, sink) => addTextNode(ctx, placement, sink),
  },
  {
    id: "add-attachment",
    label: "Add attachment",
    icon: "paperclip",
    run: (ctx, _folder, placement, sink) => addExistingAttachment(ctx, placement, sink),
  },
];

export function runAddNodeAction(
  id: AddNodeActionId,
  ctx: BoardContext,
  folder: string | undefined,
  placement: NodePlacement,
  sink?: NodeSink,
): void {
  ADD_NODE_ACTIONS.find((action) => action.id === id)?.run(ctx, folder, placement, sink);
}
