import { Menu } from "obsidian";
import type { RoadmapNode } from "../../domain/types";
import type { BoardContext } from "../boardContext";
import { promptEditText, promptGroupIntoCluster, promptNodeText, promptNodeUrl } from "../dialogs";
import {
  addCheckedGroup,
  ALIGN_H_OPTIONS,
  ALIGN_V_OPTIONS,
  COLOR_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  withNone,
} from "./helpers";

export function showNodeContextMenu(
  ctx: BoardContext,
  node: RoadmapNode,
  selectionIds: readonly string[],
  event: MouseEvent,
): void {
  const id = node.id;
  const align = node.align ?? { h: "left", v: "middle" };
  const menu = new Menu();

  addCheckedGroup(menu, withNone("No status", STATUS_OPTIONS), node.status ?? null, (status) => {
    ctx.session.updateNodeMeta(id, { status });
    ctx.commit();
  });
  menu.addSeparator();
  addCheckedGroup(menu, withNone("No priority", PRIORITY_OPTIONS), node.priority ?? null, (priority) => {
    ctx.session.updateNodeMeta(id, { priority });
    ctx.commit();
  });
  menu.addSeparator();
  addCheckedGroup(menu, ALIGN_H_OPTIONS, align.h, (h) => {
    ctx.session.setNodeAlign(id, { h });
    ctx.commit();
  });
  menu.addSeparator();
  addCheckedGroup(menu, ALIGN_V_OPTIONS, align.v, (v) => {
    ctx.session.setNodeAlign(id, { v });
    ctx.commit();
  });
  menu.addSeparator();
  addCheckedGroup(menu, withNone("No color", COLOR_OPTIONS), node.style?.color ?? null, (color) => {
    ctx.session.updateNodeMeta(id, { color });
    ctx.commit();
  });
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Set title…")
      .setIcon("pencil")
      .onClick(() => promptNodeText(ctx, id, "title")),
  );
  menu.addItem((item) =>
    item
      .setTitle("Set description…")
      .setIcon("text")
      .onClick(() => promptNodeText(ctx, id, "description")),
  );

  if (node.source.type === "url") {
    menu.addItem((item) =>
      item
        .setTitle("Set URL…")
        .setIcon("link")
        .onClick(() => promptNodeUrl(ctx, id)),
    );
  }

  if (node.source.type === "text") {
    menu.addItem((item) =>
      item
        .setTitle("Edit text…")
        .setIcon("type")
        .onClick(() => promptEditText(ctx, id)),
    );
  }

  if (node.clusterId == null) {
    const groupIds = selectionIds.includes(id) ? selectionIds : [id];

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Group into cluster")
        .setIcon("group")
        .onClick(() => promptGroupIntoCluster(ctx, groupIds)),
    );
  }

  menu.showAtMouseEvent(event);
}
