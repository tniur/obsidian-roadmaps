import { Menu } from "obsidian";
import type { NodePlacement } from "../../domain/create";
import { ADD_NODE_ACTIONS, type AddNodeActionId } from "../addNodeActions";

/**
 * One entry per registered add action. Serves the empty-canvas right-click and both
 * dangling-connection drops (new edge and reconnect) — the caller's `run` decides what
 * happens to the created node.
 */
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
