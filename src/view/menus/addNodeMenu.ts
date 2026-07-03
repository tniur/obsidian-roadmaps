import { Menu } from "obsidian";
import type { NodePlacement } from "../../domain/create";
import { addExistingNoteWithEdge, createNewNoteWithEdge } from "../addNode";
import type { BoardContext } from "../boardContext";

export interface AddNodeActions {
  createNote: (placement: NodePlacement) => void;
  addNote: (placement: NodePlacement) => void;
  addUrl: (placement: NodePlacement) => void;
  addImage: (placement: NodePlacement) => void;
  addText: (placement: NodePlacement) => void;
  addAttachment: (placement: NodePlacement) => void;
}

const ADD_NODE_ITEMS: ReadonlyArray<{ title: string; icon: string; action: keyof AddNodeActions }> = [
  { title: "Create new note", icon: "file-plus", action: "createNote" },
  { title: "Add existing note", icon: "search", action: "addNote" },
  { title: "Add URL", icon: "link", action: "addUrl" },
  { title: "Add image", icon: "image", action: "addImage" },
  { title: "Add text", icon: "type", action: "addText" },
  { title: "Add attachment", icon: "paperclip", action: "addAttachment" },
];

/** Right-click on empty canvas: create or attach any node type at that spot. */
export function showAddNodeMenu(actions: AddNodeActions, placement: NodePlacement, event: MouseEvent): void {
  const menu = new Menu();

  for (const { title, icon, action } of ADD_NODE_ITEMS) {
    menu.addItem((item) =>
      item
        .setTitle(title)
        .setIcon(icon)
        .onClick(() => actions[action](placement)),
    );
  }

  menu.showAtMouseEvent(event);
}

export interface ConnectToEmptyTarget {
  folder: string | undefined;
  fromId: string;
  fromHandle: string | null;
  placement: NodePlacement;
}

/** Dropping a connection on empty canvas: the pending edge needs a note to land on. */
export function showConnectToEmptyMenu(ctx: BoardContext, target: ConnectToEmptyTarget, event: MouseEvent): void {
  const { folder, fromId, fromHandle, placement } = target;
  const menu = new Menu();

  menu.addItem((item) =>
    item
      .setTitle("Create new note")
      .setIcon("file-plus")
      .onClick(() => {
        void createNewNoteWithEdge(ctx, folder, fromId, fromHandle, placement);
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle("Add existing note")
      .setIcon("search")
      .onClick(() => addExistingNoteWithEdge(ctx, fromId, fromHandle, placement)),
  );
  menu.showAtMouseEvent(event);
}
