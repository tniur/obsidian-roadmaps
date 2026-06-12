import { Menu, TextFileView, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { ReactFlowProvider } from "@xyflow/react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VIEW_TYPE_ROADMAP } from "../constants";
import { createNoteNode, type NodePlacement } from "../domain/create";
import { nodeOpenTarget } from "../domain/openTarget";
import type { EdgeDirection, EdgeLine, TextAlignH, TextAlignV } from "../domain/types";
import {
  emptyState,
  reconcileState,
  readState,
  writeRelations,
  writeState,
} from "../state/document";
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
    const content =
      reconciled === parsed ? data : writeRelations(writeState(data, reconciled), reconciled);
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

  private readonly handleNodesMoved = (
    moves: ReadonlyArray<{ id: string; x: number; y: number }>,
  ): void => {
    if (this.session === null || moves.length === 0) {
      return;
    }
    this.session.moveNodes(moves);
    this.commit();
  };

  private readonly handleNodeResized = (
    id: string,
    width: number,
    height: number,
    x: number,
    y: number,
  ): void => {
    this.session?.resizeNode(id, width, height, x, y);
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

  private readonly handleConnectNodes = (
    source: string,
    target: string,
    sourceHandle: string | null,
    targetHandle: string | null,
  ): void => {
    this.session?.addEdge(source, target, sourceHandle, targetHandle);
    this.commit();
  };

  private readonly handleEdgesDeleted = (ids: string[]): void => {
    if (this.session === null || ids.length === 0) {
      return;
    }
    ids.forEach((id) => this.session?.deleteEdge(id));
    this.commit();
  };

  private readonly handleEdgeContextMenu = (id: string, event: MouseEvent): void => {
    const edge = this.session?.state.edges[id];
    if (edge === undefined) {
      return;
    }
    const line = edge.style?.line ?? "solid";
    const menu = new Menu();
    const lines: { title: string; value: EdgeLine | "solid" }[] = [
      { title: "Solid line", value: "solid" },
      { title: "Dashed line", value: "dashed" },
      { title: "Dotted line", value: "dotted" },
    ];
    for (const { title, value } of lines) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(line === value)
          .onClick(() => this.updateEdge(id, { line: value })),
      );
    }
    menu.addSeparator();
    const directions: { title: string; value: EdgeDirection }[] = [
      { title: "Undirected", value: "none" },
      { title: "Directed", value: "forward" },
      { title: "Bidirectional", value: "both" },
    ];
    for (const { title, value } of directions) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(edge.direction === value)
          .onClick(() => this.updateEdge(id, { direction: value })),
      );
    }
    menu.showAtMouseEvent(event);
  };

  private updateEdge(
    id: string,
    patch: { direction?: EdgeDirection; line?: EdgeLine | "solid" },
  ): void {
    this.session?.updateEdge(id, patch);
    this.commit();
  }

  private readonly handleNodeContextMenu = (id: string, event: MouseEvent): void => {
    const node = this.session?.state.nodes[id];
    if (node === undefined) {
      return;
    }
    const align = node.align ?? { h: "left", v: "middle" };
    const menu = new Menu();
    const horizontal: { title: string; value: TextAlignH }[] = [
      { title: "Align left", value: "left" },
      { title: "Align center", value: "center" },
      { title: "Align right", value: "right" },
    ];
    for (const { title, value } of horizontal) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(align.h === value)
          .onClick(() => this.updateNodeAlign(id, { h: value })),
      );
    }
    menu.addSeparator();
    const vertical: { title: string; value: TextAlignV }[] = [
      { title: "Align top", value: "top" },
      { title: "Align middle", value: "middle" },
      { title: "Align bottom", value: "bottom" },
    ];
    for (const { title, value } of vertical) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(align.v === value)
          .onClick(() => this.updateNodeAlign(id, { v: value })),
      );
    }
    menu.showAtMouseEvent(event);
  };

  private updateNodeAlign(id: string, patch: { h?: TextAlignH; v?: TextAlignV }): void {
    this.session?.setNodeAlign(id, patch);
    this.commit();
  }

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
              onNodesMoved={this.handleNodesMoved}
              onNodeResized={this.handleNodeResized}
              onNodeOpen={this.handleNodeOpen}
              onCreateNote={this.handleCreateNote}
              onAddNote={this.handleAddNote}
              onDropFiles={this.handleDropFiles}
              onNodesDelete={this.handleNodesDeleted}
              onConnectNodes={this.handleConnectNodes}
              onEdgesDelete={this.handleEdgesDeleted}
              onEdgeContextMenu={this.handleEdgeContextMenu}
              onNodeContextMenu={this.handleNodeContextMenu}
            />
          </ReactFlowProvider>
        </div>
      </StrictMode>,
    );
  }
}
