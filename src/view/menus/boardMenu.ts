import { Menu } from "obsidian";

export interface BoardMenuOptions {
  miniMapVisible: boolean;
  onToggleMiniMap: () => void;
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
