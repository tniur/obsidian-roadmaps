import { Menu } from "obsidian";

export interface BoardMenuOptions {
  miniMapVisible: boolean;
  onToggleMiniMap: () => void;
  addBarVisible: boolean;
  onToggleAddBar: () => void;
  nodeCountVisible: boolean;
  onToggleNodeCount: () => void;
  compact: boolean;
  onToggleCompact: () => void;
  locked: boolean;
  onAutoLayout: () => void;
  onExportPdf: () => void;
  onExportCanvas: () => void;
  onOpenSettings: () => void;
}

/** Board-level settings and actions behind the gear button of the view-controls strip. */
export function showBoardMenu(options: BoardMenuOptions, event: MouseEvent): void {
  const menu = new Menu();

  menu.addItem((item) =>
    item.setTitle("Show mini-map").setIcon("map").setChecked(options.miniMapVisible).onClick(options.onToggleMiniMap),
  );
  menu.addItem((item) =>
    item
      .setTitle("Show add bar")
      .setIcon("plus-square")
      .setChecked(options.addBarVisible)
      .onClick(options.onToggleAddBar),
  );
  menu.addItem((item) =>
    item
      .setTitle("Show node count")
      .setIcon("hash")
      .setChecked(options.nodeCountVisible)
      .onClick(options.onToggleNodeCount),
  );
  menu.addItem((item) =>
    item
      .setTitle("Compact controls")
      .setIcon("minimize-2")
      .setChecked(options.compact)
      .onClick(options.onToggleCompact),
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item.setTitle("Auto-arrange nodes").setIcon("network").setDisabled(options.locked).onClick(options.onAutoLayout),
  );
  menu.addSeparator();
  menu.addItem((item) => item.setTitle("Export as PDF").setIcon("file-down").onClick(options.onExportPdf));
  menu.addItem((item) => item.setTitle("Export as JSON Canvas").setIcon("file-json").onClick(options.onExportCanvas));
  menu.addSeparator();
  menu.addItem((item) => item.setTitle("Roadmap settings…").setIcon("settings").onClick(options.onOpenSettings));

  menu.showAtMouseEvent(event);
}
