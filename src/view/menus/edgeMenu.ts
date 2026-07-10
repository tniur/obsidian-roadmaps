import { Menu } from "obsidian";
import { facingSide } from "../../domain/edges";
import type { EdgeDirection, EdgeLine, EdgeSide, RoadmapEdge } from "../../domain/types";
import type { BoardContext } from "../boardContext";
import { promptEdgeLabel } from "../dialogs";
import { addCheckedGroup, addColorGroup, type MenuOption } from "./helpers";

const LINE_OPTIONS: MenuOption<EdgeLine | "solid">[] = [
  { title: "Solid line", value: "solid" },
  { title: "Dashed line", value: "dashed" },
  { title: "Dotted line", value: "dotted" },
];

const DIRECTION_OPTIONS: MenuOption<EdgeDirection>[] = [
  { title: "Undirected", value: "none" },
  { title: "Directed", value: "forward" },
  { title: "Bidirectional", value: "both" },
];

/** Re-anchors a floating end to the side facing the other node, or sets it afloat. */
function toggleEndpointFloat(ctx: BoardContext, id: string, end: "from" | "to"): void {
  const edge = ctx.session.state.edges[id];

  if (edge === undefined) {
    return;
  }

  const floating = end === "from" ? edge.fromSide === undefined : edge.toSide === undefined;
  let side: EdgeSide | undefined;

  if (floating) {
    const self = edge[end];
    const other = end === "from" ? edge.to : edge.from;
    const selfNode = self.type === "node" ? ctx.session.state.nodes[self.id] : undefined;
    const otherNode = other.type === "node" ? ctx.session.state.nodes[other.id] : undefined;

    side = selfNode !== undefined && otherNode !== undefined ? facingSide(selfNode.layout, otherNode.layout) : "top";
  }

  ctx.session.setEdgeEndpointSide(id, end, side);
  ctx.commit();
}

export function showEdgeContextMenu(ctx: BoardContext, edge: RoadmapEdge, event: MouseEvent): void {
  const id = edge.id;
  const menu = new Menu();

  addCheckedGroup(menu, LINE_OPTIONS, edge.style?.line ?? "solid", (line) => {
    ctx.session.updateEdge(id, { line });
    ctx.commit();
  });
  menu.addSeparator();
  addColorGroup(menu, ctx, edge.style?.color, (color) => {
    ctx.session.updateEdge(id, { color });
    ctx.commit();
  });
  menu.addSeparator();
  addCheckedGroup(menu, DIRECTION_OPTIONS, edge.direction, (direction) => {
    ctx.session.updateEdge(id, { direction });
    ctx.commit();
  });

  if (edge.direction === "forward") {
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Reverse direction")
        .setIcon("arrow-left-right")
        .onClick(() => {
          ctx.session.reverseEdge(id);
          ctx.commit();
        }),
    );
  }

  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle(edge.label === undefined ? "Add label" : "Edit label")
      .setIcon("type")
      .onClick(() => promptEdgeLabel(ctx, id)),
  );

  if (edge.label !== undefined) {
    menu.addItem((item) =>
      item
        .setTitle("Remove label")
        .setIcon("x")
        .onClick(() => {
          ctx.session.updateEdge(id, { label: "" });
          ctx.commit();
        }),
    );
  }

  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Float source")
      .setChecked(edge.fromSide === undefined)
      .onClick(() => toggleEndpointFloat(ctx, id, "from")),
  );
  menu.addItem((item) =>
    item
      .setTitle("Float target")
      .setChecked(edge.toSide === undefined)
      .onClick(() => toggleEndpointFloat(ctx, id, "to")),
  );
  menu.showAtMouseEvent(event);
}
