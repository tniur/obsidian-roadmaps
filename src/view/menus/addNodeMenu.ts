import { Menu } from "obsidian";
import type { NodePlacement } from "../../domain/create";
import { addExistingNoteWithEdge, createNewNoteWithEdge } from "../addNode";
import { ADD_NODE_ACTIONS, type AddNodeActionId } from "../addNodeActions";
import type { BoardContext } from "../boardContext";

/** Right-click on empty canvas: one entry per registered add action. */
export function showAddNodeMenu(
  run: (id: AddNodeActionId, placement: NodePlacement) => void,
  placement: NodePlacement,
  event: MouseEvent,
): void {
  const menu = new Menu();

  for (const { id, label, icon } of ADD_NODE_ACTIONS) {
    menu.addItem((item) =>
      item
        .setTitle(label)
        .setIcon(icon)
        .onClick(() => run(id, placement)),
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
