import { TextFileView, TFile, type App, type Menu, type WorkspaceLeaf } from "obsidian";
import { ReactFlowProvider } from "@xyflow/react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VIEW_TYPE_ROADMAP } from "../constants";
import { createNoteNode, type NodePlacement } from "../domain/create";
import { nodeOpenTarget } from "../domain/openTarget";
import { emptyState, reconcileState, readState, writeState } from "../state/document";
import { RoadmapSession } from "../state/session";
import { NoteSuggestModal } from "./NoteSuggestModal";
import { RoadmapCanvas } from "./RoadmapCanvas";

export interface RoadmapViewHost {
  openAsMarkdown: (leaf: WorkspaceLeaf, file: TFile) => void;
  getShowBackgroundDots: () => boolean;
  setShowBackgroundDots: (value: boolean) => void;
}

type AppWithDragManager = App & {
  dragManager?: { draggable?: { file?: unknown; files?: unknown[] } };
};

export class RoadmapView extends TextFileView {
  private root: Root | null = null;
  private session: RoadmapSession | null = null;

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
    const parsed = readState(data) ?? emptyState();
    const reconciled = reconcileState(parsed, data);
    const content = reconciled === parsed ? data : writeState(data, reconciled);
    this.data = content;
    this.session = new RoadmapSession(reconciled, content);
    if (content !== data) {
      this.requestSave();
    }
    this.renderApp();
  }

  clear(): void {
    this.data = "";
    this.session = null;
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

  private commit(): void {
    if (this.session === null) {
      return;
    }
    this.data = this.session.content;
    this.requestSave();
    this.renderApp();
  }

  private readonly handleNodeMoved = (id: string, x: number, y: number): void => {
    this.session?.moveNode(id, x, y);
    this.commit();
  };

  private readonly handleNodeOpen = (id: string, newLeaf: boolean): void => {
    const node = this.session?.state.nodes[id];
    if (node === undefined) {
      return;
    }
    const target = nodeOpenTarget(node);
    if (target === null) {
      return;
    }
    if (target.kind === "url") {
      window.open(target.url);

      return;
    }
    void this.app.workspace.openLinkText(target.linktext, this.file?.path ?? "", newLeaf);
  };

  private readonly handleAddNote = (placement: NodePlacement): void => {
    new NoteSuggestModal(this.app, (file) => {
      this.session?.addNode(createNoteNode(file.path, placement));
      this.commit();
    }).open();
  };

  private readonly handleCreateNote = (placement: NodePlacement): void => {
    void this.createNote(placement);
  };

  private readonly handleNodesDeleted = (ids: string[]): void => {
    if (this.session === null || ids.length === 0) {
      return;
    }
    ids.forEach((id) => this.session?.deleteNode(id));
    this.commit();
  };

  private readonly handleDropFiles = (
    placement: NodePlacement,
    dataTransfer: DataTransfer | null,
  ): void => {
    if (this.session === null) {
      return;
    }
    const files = this.draggedFiles(dataTransfer);
    if (files.length === 0) {
      return;
    }
    files.forEach((file, index) => {
      this.session?.addNode(
        createNoteNode(file.path, { x: placement.x + index * 24, y: placement.y + index * 24 }),
      );
    });
    this.commit();
  };

  private draggedFiles(dataTransfer: DataTransfer | null): TFile[] {
    const draggable = (this.app as AppWithDragManager).dragManager?.draggable;
    if (draggable?.file instanceof TFile) {
      return [draggable.file];
    }
    if (Array.isArray(draggable?.files)) {
      const files = draggable.files.filter((entry): entry is TFile => entry instanceof TFile);
      if (files.length > 0) {
        return files;
      }
    }
    const linkpath = (dataTransfer?.getData("text/plain") ?? "")
      .replace(/^!?\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0]
      .trim();
    if (linkpath.length === 0) {
      return [];
    }
    const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, this.file?.path ?? "");

    return file === null ? [] : [file];
  }

  private async createNote(placement: NodePlacement): Promise<void> {
    if (this.session === null) {
      return;
    }
    const path = this.availableNotePath("Untitled Node");
    const file = await this.app.vault.create(path, "");
    this.session.addNode(createNoteNode(file.path, placement));
    this.commit();
  }

  private availableNotePath(base: string): string {
    const folder = this.file?.parent?.path;
    const prefix = folder === undefined || folder === "" || folder === "/" ? "" : `${folder}/`;
    if (this.app.vault.getAbstractFileByPath(`${prefix}${base}.md`) === null) {
      return `${prefix}${base}.md`;
    }
    let index = 1;
    while (this.app.vault.getAbstractFileByPath(`${prefix}${base} ${index}.md`) !== null) {
      index += 1;
    }

    return `${prefix}${base} ${index}.md`;
  }

  private renderApp(): void {
    if (this.root === null || this.session === null) {
      return;
    }
    this.root.render(
      <StrictMode>
        <div className="rm-view">
          <ReactFlowProvider>
            <RoadmapCanvas
              state={this.session.state}
              initialDotsVisible={this.host.getShowBackgroundDots()}
              onDotsVisibleChange={this.host.setShowBackgroundDots}
              onNodeMoved={this.handleNodeMoved}
              onNodeOpen={this.handleNodeOpen}
              onCreateNote={this.handleCreateNote}
              onAddNote={this.handleAddNote}
              onDropFiles={this.handleDropFiles}
              onNodesDelete={this.handleNodesDeleted}
            />
          </ReactFlowProvider>
        </div>
      </StrictMode>,
    );
  }
}
