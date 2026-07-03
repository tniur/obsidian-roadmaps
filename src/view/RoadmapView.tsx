import { Menu, Notice, TextFileView, TFile, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { ReactFlowProvider, type ReactFlowInstance } from "@xyflow/react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VIEW_TYPE_ROADMAP } from "../constants";
import { centeredPlacement, copyNode, type NodePlacement } from "../domain/create";
import { nodeOpenTarget } from "../domain/openTarget";
import { isSafeUrl } from "../domain/paths";
import { sourceFile } from "../domain/source";
import type { RoadmapNode, RoadmapViewport } from "../domain/types";
import { availableVaultPath, draggedFiles, nodeForFile } from "../services/vaultFiles";
import { StateVersionError } from "../state/codec";
import { loadDocument, rebuildDocument, type DocumentWarning, type LoadedDocument } from "../state/reconcile";
import { RoadmapSession, type RoadmapConnection } from "../state/session";
import {
  addExistingAttachment,
  addExistingImage,
  addExistingNote,
  addTextNode,
  addUrlNode,
  createNewNote,
} from "./addNode";
import type { BoardContext } from "./boardContext";
import { promptEditText, promptGroupIntoCluster } from "./dialogs";
import { exportBoardPdf } from "./exportPdf";
import { showAddNodeMenu, showConnectToEmptyMenu } from "./menus/addNodeMenu";
import { showClusterContextMenu } from "./menus/clusterMenu";
import { showEdgeContextMenu } from "./menus/edgeMenu";
import { showNodeContextMenu } from "./menus/nodeMenu";
import { NodePreviewPanel } from "./NodePreviewPanel";
import { mountPreviewContent } from "./preview";
import { RoadmapCanvas } from "./RoadmapCanvas";

export interface RoadmapViewHost {
  openAsMarkdown: (leaf: WorkspaceLeaf, file: TFile) => void;
  getShowBackgroundDots: () => boolean;
  setShowBackgroundDots: (value: boolean) => void;
}

export type AddNodeCommand = "create-note" | "add-note" | "add-url" | "add-image" | "add-text" | "add-attachment";

/** Offset applied per element when pasting or dropping several at once, so copies fan out. */
const CASCADE_OFFSET = 24;

const VIEWPORT_SAVE_DELAY = 600;

const WARNING_MESSAGES: Record<DocumentWarning, string> = {
  "rebuilt-state": "state block was missing; rebuilt from the note body.",
  "restored-nodes": "restored node entries missing from the note body.",
};

export class RoadmapView extends TextFileView {
  private root: Root | null = null;
  private session: RoadmapSession | null = null;
  private selectedNodeIds: string[] = [];
  private clipboard: RoadmapNode[] = [];
  private pasteOffset = 0;
  private focusIds: string[] = [];
  private focusNonce = 0;
  private previewNodeId: string | null = null;
  private previewRefreshNonce = 0;
  private loadError: string | null = null;
  private loadErrorRecoverable = false;
  private locked = false;
  private viewportSaveTimer: number | null = null;
  private diskData: string | null = null;
  private flow: ReactFlowInstance | null = null;

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

  /**
   * Runs the document open pipeline (`loadDocument`) into a session. A corrupted or
   * newer-version state block opens the view read-only instead of throwing, and never
   * rewrites the file.
   */
  setViewData(data: string): void {
    this.loadError = null;
    this.diskData = data;
    let loaded: LoadedDocument;

    try {
      loaded = loadDocument(data);
    } catch (error) {
      const newerVersion = error instanceof StateVersionError;

      this.data = data;
      this.session = null;
      this.loadError = newerVersion
        ? "This roadmap was saved by a newer plugin version. Update the plugin to edit it."
        : "The roadmap state block is corrupted.";
      this.loadErrorRecoverable = !newerVersion;
      new Notice(`Roadmap: ${this.loadError}`);
      this.renderApp();

      return;
    }

    for (const warning of loaded.warnings) {
      new Notice(`Roadmap: ${WARNING_MESSAGES[warning]}`);
    }

    this.data = loaded.content;
    this.session = new RoadmapSession(loaded.state, loaded.content);

    if (loaded.content !== data) {
      this.requestSave();
    }

    this.renderApp();
  }

  clear(): void {
    this.data = "";
    this.session = null;
    this.loadError = null;
    this.diskData = null;
  }

  private readonly handleRebuildFromBody = (): void => {
    const rebuilt = rebuildDocument(this.data);

    this.loadError = null;
    this.data = rebuilt.content;
    this.session = new RoadmapSession(rebuilt.state, rebuilt.content);
    this.requestSave();
    new Notice("Roadmap: rebuilt from the note body; layout was reset.");
    this.renderApp();
  };

  /**
   * Guards against overwriting edits that landed on disk from outside this view (sync,
   * another device, an external editor) while local changes were pending. On a conflict
   * the disk version wins — the roadmap file is shared state — and the view reloads it.
   */
  async save(clear?: boolean): Promise<void> {
    const file = this.file;

    if (file !== null && this.diskData !== null) {
      const disk = await this.app.vault.read(file);

      if (disk !== this.diskData && disk !== this.data) {
        new Notice("Roadmap: file changed outside this view; reloaded the newer version.");
        this.setViewData(disk);

        return;
      }
    }

    await super.save(clear);
    this.diskData = this.data;
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
    this.registerDomEvent(this.contentEl.ownerDocument, "keydown", this.handleKeyDown);
    this.registerEvent(this.app.vault.on("modify", this.handleVaultModify));
    this.registerEvent(this.app.vault.on("rename", this.handleVaultRename));
    this.registerEvent(this.app.vault.on("delete", this.handleVaultDelete));
    this.renderApp();
  }

  protected async onClose(): Promise<void> {
    if (this.viewportSaveTimer !== null) {
      window.clearTimeout(this.viewportSaveTimer);
      this.viewportSaveTimer = null;
    }

    this.root?.unmount();
    this.root = null;
  }

  /** Session-dependent modules (menus, dialogs, add flows) get this narrow surface. */
  private boardContext(): BoardContext | null {
    const session = this.session;

    if (session === null) {
      return null;
    }

    return { app: this.app, session, commit: () => this.commit() };
  }

  private editableContext(): BoardContext | null {
    return this.locked ? null : this.boardContext();
  }

  private noteFolder(): string | undefined {
    return this.file?.parent?.path;
  }

  /**
   * Keeps node sources pointing at renamed files and folders. Applied
   * outside the undo history: the rename already happened in the vault, so undoing it
   * from the roadmap would only break the links again.
   */
  private readonly handleVaultRename = (file: TAbstractFile, oldPath: string): void => {
    if (this.session === null) {
      return;
    }

    if (this.session.applySourceRename(oldPath, file.path)) {
      this.data = this.session.content;
      this.requestSave();
      this.previewRefreshNonce += 1;
    }

    this.renderApp();
  };

  private readonly handleVaultDelete = (): void => {
    this.renderApp();
  };

  private readonly handleVaultModify = (file: TAbstractFile): void => {
    if (this.previewNodeId === null || this.session === null) {
      return;
    }

    const node = this.session.state.nodes[this.previewNodeId];

    if (node !== undefined && sourceFile(node.source) === file.path) {
      this.previewRefreshNonce += 1;
      this.renderApp();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }

    if (this.app.workspace.getActiveViewOfType(RoadmapView) !== this) {
      return;
    }

    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "z") {
      event.preventDefault();
      event.stopPropagation();

      if (event.shiftKey) {
        this.redoEdit();
      } else {
        this.undoEdit();
      }
    } else if (key === "y") {
      event.preventDefault();
      event.stopPropagation();
      this.redoEdit();
    } else if (key === "c") {
      this.copySelection();
    } else if (key === "v") {
      this.pasteClipboard();
    }
  };

  readonly undoEdit = (): void => {
    if (this.session?.undo() === true) {
      this.commit();
    }
  };

  readonly redoEdit = (): void => {
    if (this.session?.redo() === true) {
      this.commit();
    }
  };

  canUndoEdit(): boolean {
    return this.session?.canUndo === true;
  }

  canRedoEdit(): boolean {
    return this.session?.canRedo === true;
  }

  isBoardLoaded(): boolean {
    return this.session !== null;
  }

  isBoardEditable(): boolean {
    return this.session !== null && !this.locked;
  }

  fitToNodes(): void {
    void this.flow?.fitView();
  }

  readonly toggleLock = (): void => {
    this.locked = !this.locked;
    this.renderApp();
  };

  /** Snapshots visible nodes and edges into a PDF written next to the roadmap file. */
  async exportPdf(): Promise<void> {
    const file = this.file;
    const viewport = this.contentEl.querySelector<HTMLElement>(".react-flow__viewport");
    const boardEl = this.contentEl.querySelector<HTMLElement>(".rm-view");

    if (this.session === null || this.flow === null || file === null || viewport === null) {
      return;
    }

    try {
      const background = getComputedStyle(boardEl ?? this.contentEl).backgroundColor;
      const pdf = await exportBoardPdf(viewport, this.flow.getNodes(), background);

      if (pdf === null) {
        new Notice("Nothing to export: the board is empty.");

        return;
      }

      const path = availableVaultPath(this.app.vault, file.parent?.path, file.basename, "pdf");

      await this.app.vault.createBinary(path, pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength));
      new Notice(`Exported PDF: ${path}`);
    } catch (error) {
      new Notice(`Failed to export PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  runAddNode(command: AddNodeCommand): void {
    const placement = this.canvasCenterPlacement();

    if (this.session === null || this.locked || placement === null) {
      return;
    }

    switch (command) {
      case "create-note":
        this.handleCreateNote(placement);
        break;
      case "add-note":
        this.handleAddNote(placement);
        break;
      case "add-url":
        this.handleAddUrl(placement);
        break;
      case "add-image":
        this.handleAddImage(placement);
        break;
      case "add-text":
        this.handleAddText(placement);
        break;
      case "add-attachment":
        this.handleAddAttachment(placement);
        break;
    }
  }

  private canvasCenterPlacement(): NodePlacement | null {
    if (this.flow === null) {
      return null;
    }

    const rect = this.contentEl.getBoundingClientRect();
    const center = this.flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

    return centeredPlacement(center);
  }

  private readonly handleFlowInit = (instance: ReactFlowInstance | null): void => {
    this.flow = instance;
  };

  private readonly handleExportPdf = (): void => {
    void this.exportPdf();
  };

  /** Clipboard entries carry absolute coordinates: cluster members store cluster-relative
   * layout, but pasted copies land unclustered ([[copyNode]]), so their frame is absolute. */
  private withAbsoluteLayout(node: RoadmapNode): RoadmapNode {
    if (node.clusterId == null) {
      return node;
    }

    const cluster = this.session?.state.clusters[node.clusterId];

    if (cluster === undefined) {
      return node;
    }

    return {
      ...node,
      layout: { ...node.layout, x: node.layout.x + cluster.layout.x, y: node.layout.y + cluster.layout.y },
    };
  }

  private copySelection(): void {
    if (this.session === null) {
      return;
    }

    const nodes: RoadmapNode[] = [];

    for (const id of this.selectedNodeIds) {
      const node = this.session.state.nodes[id];

      if (node !== undefined) {
        nodes.push(this.withAbsoluteLayout(node));
      }
    }

    if (nodes.length > 0) {
      this.clipboard = nodes;
      this.pasteOffset = 0;
    }
  }

  private pasteClipboard(): void {
    if (this.session === null || this.locked || this.clipboard.length === 0) {
      return;
    }

    this.pasteOffset += CASCADE_OFFSET;
    const clones = this.clipboard.map((node) =>
      copyNode(node, node.layout.x + this.pasteOffset, node.layout.y + this.pasteOffset),
    );

    this.session.addNodes(clones);
    this.focusNodes(clones.map((node) => node.id));
    this.commit();
  }

  private focusNodes(ids: string[]): void {
    this.focusIds = ids;
    this.focusNonce += 1;
  }

  private readonly handleSelectionChange = (ids: string[]): void => {
    this.selectedNodeIds = ids;
  };

  private readonly isNodeMissing = (node: RoadmapNode): boolean => {
    const path = sourceFile(node.source);

    return path !== null && this.app.vault.getAbstractFileByPath(path) === null;
  };

  private readonly resolveImageSrc = (node: RoadmapNode): string | null => {
    if (node.source.type !== "image") {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(node.source.file);

    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  };

  private readonly handleNodesDuplicated = (items: ReadonlyArray<{ id: string; x: number; y: number }>): void => {
    if (this.session === null || items.length === 0) {
      return;
    }

    const clones: RoadmapNode[] = [];

    for (const { id, x, y } of items) {
      const node = this.session.state.nodes[id];

      if (node !== undefined) {
        clones.push(copyNode(node, x, y));
      }
    }

    this.session.addNodes(clones);
    this.focusNodes(clones.map((node) => node.id));
    this.commit();
  };

  private readonly handleViewportChange = (viewport: RoadmapViewport): void => {
    if (this.viewportSaveTimer !== null) {
      window.clearTimeout(this.viewportSaveTimer);
    }

    this.viewportSaveTimer = window.setTimeout(() => {
      this.viewportSaveTimer = null;

      if (this.session === null) {
        return;
      }

      this.session.setViewport(viewport);
      this.data = this.session.content;
      this.requestSave();
    }, VIEWPORT_SAVE_DELAY);
  };

  private commit(): void {
    if (this.session === null) {
      return;
    }

    this.data = this.session.content;
    this.requestSave();
    this.renderApp();
  }

  private readonly handleNodesMoved = (moves: ReadonlyArray<{ id: string; x: number; y: number }>): void => {
    if (this.session === null || moves.length === 0) {
      return;
    }

    const clusterMoves = moves.filter((move) => this.session?.state.clusters[move.id] !== undefined);
    const nodeMoves = moves.filter((move) => this.session?.state.nodes[move.id] !== undefined);

    if (clusterMoves.length > 0) {
      this.session.moveClusters(clusterMoves);
    }

    if (nodeMoves.length > 0) {
      this.session.moveNodes(nodeMoves);
    }

    this.commit();
  };

  private readonly handleNodesReparent = (
    items: ReadonlyArray<{ id: string; clusterId: string | null; x: number; y: number }>,
  ): void => {
    if (this.session === null || items.length === 0) {
      return;
    }

    this.session.setNodesCluster(items);
    this.commit();
  };

  private readonly handleNodeResized = (id: string, width: number, height: number, x: number, y: number): void => {
    if (this.session === null) {
      return;
    }

    if (this.session.state.clusters[id] !== undefined) {
      this.session.resizeCluster(id, width, height, x, y);
    } else {
      this.session.resizeNode(id, width, height, x, y);
    }

    this.commit();
  };

  private readonly handleClusterToggleCollapse = (id: string): void => {
    this.session?.toggleClusterCollapsed(id);
    this.commit();
  };

  private readonly handleClusterArrange = (id: string): void => {
    this.session?.arrangeCluster(id);
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
      if (isSafeUrl(target.url)) {
        window.open(target.url);
      }

      return;
    }

    void this.app.workspace.openLinkText(target.linktext, this.file?.path ?? "", newLeaf);
  };

  private readonly handleNodePreview = (id: string): void => {
    const ctx = this.boardContext();
    const node = ctx?.session.state.nodes[id];

    if (ctx === null || node === undefined) {
      return;
    }

    if (node.source.type === "url") {
      this.handleNodeOpen(id, false);

      return;
    }

    if (node.source.type === "text") {
      promptEditText(ctx, id);

      return;
    }

    this.previewNodeId = id;
    this.renderApp();
  };

  private readonly handleClosePreview = (): void => {
    this.previewNodeId = null;
    this.renderApp();
  };

  private readonly handleEditPreview = (): void => {
    if (this.previewNodeId !== null) {
      this.handleNodeOpen(this.previewNodeId, true);
    }
  };

  private readonly mountPreview = (node: RoadmapNode, el: HTMLElement): (() => void) =>
    mountPreviewContent(this.app, node, el);

  private readonly handleCreateNote = (placement: NodePlacement): void => {
    const ctx = this.boardContext();

    if (ctx !== null) {
      void createNewNote(ctx, this.noteFolder(), placement);
    }
  };

  private readonly handleAddNote = (placement: NodePlacement): void => {
    const ctx = this.boardContext();

    if (ctx !== null) {
      addExistingNote(ctx, placement);
    }
  };

  private readonly handleAddImage = (placement: NodePlacement): void => {
    const ctx = this.boardContext();

    if (ctx !== null) {
      addExistingImage(ctx, placement);
    }
  };

  private readonly handleAddAttachment = (placement: NodePlacement): void => {
    const ctx = this.boardContext();

    if (ctx !== null) {
      addExistingAttachment(ctx, placement);
    }
  };

  private readonly handleAddUrl = (placement: NodePlacement): void => {
    const ctx = this.boardContext();

    if (ctx !== null) {
      addUrlNode(ctx, placement);
    }
  };

  private readonly handleAddText = (placement: NodePlacement): void => {
    const ctx = this.boardContext();

    if (ctx !== null) {
      addTextNode(ctx, placement);
    }
  };

  private readonly handleCreateNodeAt = (placement: NodePlacement, event: MouseEvent): void => {
    if (this.locked) {
      return;
    }

    showAddNodeMenu(
      {
        createNote: this.handleCreateNote,
        addNote: this.handleAddNote,
        addUrl: this.handleAddUrl,
        addImage: this.handleAddImage,
        addText: this.handleAddText,
        addAttachment: this.handleAddAttachment,
      },
      centeredPlacement(placement),
      event,
    );
  };

  private readonly handleConnectToEmpty = (
    source: string,
    sourceHandle: string | null,
    placement: NodePlacement,
    event: MouseEvent,
  ): void => {
    const ctx = this.boardContext();

    if (ctx === null) {
      return;
    }

    showConnectToEmptyMenu(
      ctx,
      { folder: this.noteFolder(), fromId: source, fromHandle: sourceHandle, placement: centeredPlacement(placement) },
      event,
    );
  };

  private readonly handleDeleteElements = (nodeIds: string[], edgeIds: string[]): void => {
    if (this.session === null || (nodeIds.length === 0 && edgeIds.length === 0)) {
      return;
    }

    this.session.deleteElements(nodeIds, edgeIds);
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

  private readonly handleReconnectEdge = (id: string, connection: RoadmapConnection): void => {
    this.session?.reconnectEdge(id, connection);
    this.commit();
  };

  private readonly handleEdgeContextMenu = (id: string, event: MouseEvent): void => {
    const ctx = this.editableContext();
    const edge = ctx?.session.state.edges[id];

    if (ctx === null || edge === undefined) {
      return;
    }

    showEdgeContextMenu(ctx, edge, event);
  };

  private readonly handleNodeContextMenu = (id: string, event: MouseEvent): void => {
    const ctx = this.editableContext();

    if (ctx === null) {
      return;
    }

    const cluster = ctx.session.state.clusters[id];

    if (cluster !== undefined) {
      showClusterContextMenu(ctx, cluster, event);

      return;
    }

    const node = ctx.session.state.nodes[id];

    if (node !== undefined) {
      showNodeContextMenu(ctx, node, this.selectedNodeIds, event);
    }
  };

  private readonly handleSelectionContextMenu = (ids: string[], event: MouseEvent): void => {
    const ctx = this.editableContext();

    if (ctx === null) {
      return;
    }

    const targets = ids.filter((id) => ctx.session.state.nodes[id]?.clusterId == null);

    if (targets.length === 0) {
      return;
    }

    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Group into cluster")
        .setIcon("group")
        .onClick(() => promptGroupIntoCluster(ctx, targets)),
    );
    menu.showAtMouseEvent(event);
  };

  private readonly handleDropFiles = (placement: NodePlacement, dataTransfer: DataTransfer | null): void => {
    if (this.session === null || this.locked) {
      return;
    }

    const files = draggedFiles(this.app, dataTransfer, this.file?.path ?? "");

    if (files.length === 0) {
      return;
    }

    files.forEach((file, index) => {
      const offset = index * CASCADE_OFFSET;

      this.session?.addNode(nodeForFile(file, { x: placement.x + offset, y: placement.y + offset }));
    });
    this.commit();
  };

  private renderApp(): void {
    if (this.root === null) {
      return;
    }

    if (this.loadError !== null) {
      const file = this.file;

      this.root.render(
        <StrictMode>
          <div className="rm-view">
            <div className="rm-load-error">
              <p className="rm-load-error__message">{this.loadError}</p>
              {this.loadErrorRecoverable ? (
                <p className="rm-load-error__message">
                  Fix it in Markdown, or rebuild the roadmap from the note body — content survives, but the layout
                  resets.
                </p>
              ) : null}
              <div className="rm-load-error__actions">
                {this.loadErrorRecoverable ? (
                  <button type="button" className="rm-load-error__action" onClick={this.handleRebuildFromBody}>
                    Rebuild from note body
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rm-load-error__action"
                  onClick={() => {
                    if (file !== null) {
                      this.host.openAsMarkdown(this.leaf, file);
                    }
                  }}
                >
                  Open as Markdown
                </button>
              </div>
            </div>
          </div>
        </StrictMode>,
      );

      return;
    }

    if (this.session === null) {
      return;
    }

    const previewNode = this.previewNodeId === null ? undefined : this.session.state.nodes[this.previewNodeId];

    this.root.render(
      <StrictMode>
        <div className="rm-view">
          <ReactFlowProvider>
            <RoadmapCanvas
              state={this.session.state}
              isNodeMissing={this.isNodeMissing}
              resolveImageSrc={this.resolveImageSrc}
              initialDotsVisible={this.host.getShowBackgroundDots()}
              onDotsVisibleChange={this.host.setShowBackgroundDots}
              locked={this.locked}
              onToggleLock={this.toggleLock}
              onViewportChange={this.handleViewportChange}
              onFlowInit={this.handleFlowInit}
              onExportPdf={this.handleExportPdf}
              canUndo={this.session.canUndo}
              canRedo={this.session.canRedo}
              onUndo={this.undoEdit}
              onRedo={this.redoEdit}
              focusIds={this.focusIds}
              focusNonce={this.focusNonce}
              onNodesMoved={this.handleNodesMoved}
              onNodesReparent={this.handleNodesReparent}
              onNodesDuplicate={this.handleNodesDuplicated}
              onNodeResized={this.handleNodeResized}
              onClusterToggleCollapse={this.handleClusterToggleCollapse}
              onClusterArrange={this.handleClusterArrange}
              onNodeOpen={this.handleNodeOpen}
              onNodePreview={this.handleNodePreview}
              onSelectionChange={this.handleSelectionChange}
              onCreateNote={this.handleCreateNote}
              onAddNote={this.handleAddNote}
              onAddUrl={this.handleAddUrl}
              onAddImage={this.handleAddImage}
              onAddText={this.handleAddText}
              onAddAttachment={this.handleAddAttachment}
              onCreateNodeAt={this.handleCreateNodeAt}
              onDropFiles={this.handleDropFiles}
              onDeleteElements={this.handleDeleteElements}
              onConnectNodes={this.handleConnectNodes}
              onReconnectEdge={this.handleReconnectEdge}
              onConnectToEmpty={this.handleConnectToEmpty}
              onEdgeContextMenu={this.handleEdgeContextMenu}
              onNodeContextMenu={this.handleNodeContextMenu}
              onSelectionContextMenu={this.handleSelectionContextMenu}
            />
          </ReactFlowProvider>
          {previewNode !== undefined ? (
            <NodePreviewPanel
              key={previewNode.id}
              node={previewNode}
              mount={this.mountPreview}
              refreshNonce={this.previewRefreshNonce}
              onEdit={this.handleEditPreview}
              onClose={this.handleClosePreview}
            />
          ) : null}
        </div>
      </StrictMode>,
    );
  }
}
