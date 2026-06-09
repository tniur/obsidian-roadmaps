import { TextFileView, type Menu, type TFile, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VIEW_TYPE_ROADMAP } from "../constants";
import { RoadmapCanvas } from "./RoadmapCanvas";

export interface RoadmapViewHost {
  openAsMarkdown: (leaf: WorkspaceLeaf, file: TFile) => void;
  getShowBackgroundDots: () => boolean;
  setShowBackgroundDots: (value: boolean) => void;
}

export class RoadmapView extends TextFileView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: RoadmapViewHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_ROADMAP;
  }

  getIcon(): string {
    return "map";
  }

  getViewData(): string {
    return this.data;
  }

  setViewData(data: string): void {
    this.data = data;
    this.renderApp();
  }

  clear(): void {
    this.data = "";
  }

  onPaneMenu(menu: Menu, source: string): void {
    const file = this.file;
    if (file !== null) {
      menu.addItem((item) =>
        item
          .setSection("pane")
          .setTitle("Open as Markdown")
          .setIcon("file-text")
          .onClick(() => {
            this.host.openAsMarkdown(this.leaf, file);
          }),
      );
    }
    super.onPaneMenu(menu, source);
  }

  protected async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.renderApp();
  }

  protected async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  private renderApp(): void {
    if (this.root === null) {
      return;
    }
    this.root.render(
      <StrictMode>
        <div className="rm-view">
          <RoadmapCanvas
            initialDotsVisible={this.host.getShowBackgroundDots()}
            onDotsVisibleChange={this.host.setShowBackgroundDots}
          />
        </div>
      </StrictMode>,
    );
  }
}
