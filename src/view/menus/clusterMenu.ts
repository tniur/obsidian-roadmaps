import { Menu } from "obsidian";
import type { RoadmapCluster } from "../../domain/types";
import type { BoardContext } from "../boardContext";
import { promptRenameCluster } from "../dialogs";
import { addCheckedGroup, COLOR_OPTIONS, withNone } from "./helpers";

export function showClusterContextMenu(ctx: BoardContext, cluster: RoadmapCluster, event: MouseEvent): void {
  const id = cluster.id;
  const collapsed = cluster.collapsed === true;
  const menu = new Menu();

  menu.addItem((item) =>
    item
      .setTitle(collapsed ? "Expand" : "Collapse")
      .setIcon(collapsed ? "chevron-down" : "chevron-right")
      .onClick(() => {
        ctx.session.toggleClusterCollapsed(id);
        ctx.commit();
      }),
  );

  if (!collapsed) {
    menu.addItem((item) =>
      item
        .setTitle("Arrange nodes")
        .setIcon("layout-grid")
        .onClick(() => {
          ctx.session.arrangeCluster(id);
          ctx.commit();
        }),
    );
  }

  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Rename…")
      .setIcon("pencil")
      .onClick(() => promptRenameCluster(ctx, cluster)),
  );
  addCheckedGroup(menu, withNone("No color", COLOR_OPTIONS), cluster.style?.color ?? null, (color) => {
    ctx.session.setClusterColor(id, color);
    ctx.commit();
  });
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Delete cluster (keep nodes)")
      .setIcon("ungroup")
      .onClick(() => {
        ctx.session.dissolveCluster(id);
        ctx.commit();
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle("Delete cluster and its nodes")
      .setIcon("trash-2")
      .onClick(() => {
        ctx.session.deleteClusterAndNodes(id);
        ctx.commit();
      }),
  );
  menu.showAtMouseEvent(event);
}
