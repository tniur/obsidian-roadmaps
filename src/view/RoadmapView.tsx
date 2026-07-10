import { Menu, Notice, TextFileView, TFile, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { ReactFlowProvider } from "@xyflow/react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VIEW_TYPE_ROADMAP } from "../constants";
import {
  centeredPlacement,
  centerNodesShift,
  copiedEdges,
  copyCluster,
  copyNode,
  type NodePlacement,
} from "../domain/create";
import { roadmapToCanvas, serializeCanvas } from "../domain/jsonCanvas";
import { nodeOpenTarget } from "../domain/openTarget";
import { isSafeUrl } from "../domain/paths";
import { sourceFile } from "../domain/source";
import type { RoadmapCluster, RoadmapEdge, RoadmapNode, RoadmapViewport } from "../domain/types";
import { availableVaultPath, draggedFiles, nodeForFile } from "../services/vaultFiles";
import type { RoadmapFlowInstance } from "./flow";
import { StateVersionError } from "../state/codec";
import { loadDocument, rebuildDocument, type DocumentWarning, type LoadedDocument } from "../state/reconcile";
import { RoadmapSession, type RoadmapConnection } from "../state/session";
import type { NodeSink } from "./addNode";
import { runAddNodeAction, type AddNodeActionId } from "./addNodeActions";
import type { BoardContext } from "./boardContext";
import { ChoiceModal } from "./ChoiceModal";
import { promptEditText, promptGroupIntoCluster } from "./dialogs";
import { exportBoardPdf } from "./exportPdf";
import { showAddNodeMenu } from "./menus/addNodeMenu";
import { showClusterContextMenu } from "./menus/clusterMenu";
import { showEdgeContextMenu } from "./menus/edgeMenu";
import { showNodeContextMenu } from "./menus/nodeMenu";
import { NodePreviewPanel } from "./NodePreviewPanel";
import { mountPreviewContent } from "./preview";
import { RF_VIEWPORT_CLASS } from "./reactFlowInternals";
import {
  RoadmapCanvas,
  type CanvasBoardActions,
  type CanvasClusterActions,
  type CanvasEdgeActions,
  type CanvasNodeActions,
} from "./RoadmapCanvas";

export interface RoadmapViewHost {
  openAsMarkdown: (leaf: WorkspaceLeaf, file: TFile) => void;
  getShowBackgroundDots: () => boolean;
  setShowBackgroundDots: (value: boolean) => void;
  getShowMiniMap: () => boolean;
  setShowMiniMap: (value: boolean) => void;
  getPalette: () => readonly string[];
  getClipboard: () => BoardClipboard | null;
  setClipboard: (value: BoardClipboard) => void;
}

/**
 * Copy buffer held by the plugin and shared by every board, so nodes copied on one
 * roadmap paste into another. Loose nodes and cluster frames carry absolute coordinates;
 * members of a copied cluster keep their cluster-relative layout and `clusterId`.
 * `boardId` tells a same-board paste (fans out next to the originals) from a cross-board
 * one (recentered on the target viewport).
 */
export interface BoardClipboard {
  boardId: string;
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
  clusters: RoadmapCluster[];
  pasteOffset: number;
}

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
  private focusIds: string[] = [];
  private focusNonce = 0;
  private previewNodeId: string | null = null;
  private previewRefreshNonce = 0;
  private searchOpenNonce = 0;
  private filterOpenNonce = 0;
  private loadError: string | null = null;
  private loadErrorRecoverable = false;
  private locked = false;
  private viewportSaveTimer: number | null = null;
  private diskData: string | null = null;
  private flow: RoadmapFlowInstance | null = null;
  private readonly nodeActions: CanvasNodeActions;
  private readonly edgeActions: CanvasEdgeActions;
  private readonly clusterActions: CanvasClusterActions;
  private readonly boardActions: CanvasBoardActions;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: RoadmapViewHost,
  ) {
    super(leaf);
    this.nodeActions = {
      onMoved: this.handleNodesMoved,
      onReparent: this.handleNodesReparent,
      onDuplicate: this.handleNodesDuplicated,
      onResized: this.handleNodeResized,
      onOpen: this.handleNodeOpen,
      onPreview: this.handleNodePreview,
      onContextMenu: this.handleNodeContextMenu,
      onSelectionContextMenu: this.handleSelectionContextMenu,
      onSelectionChange: this.handleSelectionChange,
    };
    this.edgeActions = {
      onConnect: this.handleConnectNodes,
      onReconnect: this.handleReconnectEdge,
      onConnectToEmpty: this.handleConnectToEmpty,
      onReconnectToEmpty: this.handleReconnectToEmpty,
      onContextMenu: this.handleEdgeContextMenu,
    };
    this.clusterActions = {
      onToggleCollapse: this.handleClusterToggleCollapse,
      onArrange: this.handleClusterArrange,
    };
    this.boardActions = {
      onUndo: this.undoEdit,
      onRedo: this.redoEdit,
      onToggleLock: this.toggleLock,
      onAutoLayout: this.autoLayout,
      onExportPdf: this.handleExportPdf,
      onDotsVisibleChange: host.setShowBackgroundDots,
      onMiniMapVisibleChange: host.setShowMiniMap,
      onViewportChange: this.handleViewportChange,
      onFlowInit: this.handleFlowInit,
      onAddAction: this.runAddActionAt,
      onPaneContextMenu: this.handlePaneContextMenu,
      onDropFiles: this.handleDropFiles,
      onDeleteElements: this.handleDeleteElements,
    };
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

  /** Canonicalizes wikilink targets (Obsidian may write them in shortest form). */
  private readonly resolveLinkTarget = (target: string): string | null =>
    this.app.metadataCache.getFirstLinkpathDest(target, this.file?.path ?? "")?.path ?? null;

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
      loaded = loadDocument(data, this.resolveLinkTarget);
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
    const rebuilt = rebuildDocument(this.data, this.resolveLinkTarget);

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

    if (this.session !== null) {
      menu.addItem((item) =>
        item
          .setSection("action")
          .setTitle("Export as JSON Canvas")
          .setIcon("file-json")
          .onClick(() => {
            void this.exportCanvas();
          }),
      );
    }

    super.onPaneMenu(menu, source);
  }

  protected onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.registerDomEvent(this.contentEl.ownerDocument, "keydown", this.handleKeyDown);
    this.registerEvent(this.app.vault.on("modify", this.handleVaultModify));
    this.registerEvent(this.app.vault.on("rename", this.handleVaultRename));
    this.registerEvent(this.app.vault.on("delete", this.handleVaultDelete));
    this.renderApp();

    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    if (this.viewportSaveTimer !== null) {
      window.clearTimeout(this.viewportSaveTimer);
      this.viewportSaveTimer = null;
    }

    this.root?.unmount();
    this.root = null;

    return Promise.resolve();
  }

  /** Session-dependent modules (menus, dialogs, add flows) get this narrow surface. */
  private boardContext(): BoardContext | null {
    const session = this.session;

    if (session === null) {
      return null;
    }

    /* The context captures this session; an async dialog may resolve after the file
       reloaded into a fresh one. Committing then would drop the dialog's change silently,
       so a stale commit no-ops with a Notice instead. */
    return {
      app: this.app,
      session,
      commit: () => {
        if (session !== this.session) {
          new Notice("Board was reloaded; that change was not applied.");

          return;
        }

        this.commit();
      },
      palette: this.host.getPalette(),
    };
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

  /** Re-renders missing-source indicators, but only when the deleted file (or a file
   * inside the deleted folder) actually backs one of the board's nodes. */
  private readonly handleVaultDelete = (file: TAbstractFile): void => {
    if (this.session === null) {
      return;
    }

    const prefix = `${file.path}/`;
    const affected = Object.values(this.session.state.nodes).some((node) => {
      const path = sourceFile(node.source);

      return path !== null && (path === file.path || path.startsWith(prefix));
    });

    if (affected) {
      this.renderApp();
    }
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

  /** Undo counts as an edit, so the board lock blocks it together with mutations. */
  readonly undoEdit = (): void => {
    if (!this.locked && this.session?.undo() === true) {
      this.commit();
    }
  };

  readonly redoEdit = (): void => {
    if (!this.locked && this.session?.redo() === true) {
      this.commit();
    }
  };

  canUndoEdit(): boolean {
    return !this.locked && this.session?.canUndo === true;
  }

  canRedoEdit(): boolean {
    return !this.locked && this.session?.canRedo === true;
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

  openSearch(): void {
    this.searchOpenNonce += 1;
    this.renderApp();
  }

  openFilter(): void {
    this.filterOpenNonce += 1;
    this.renderApp();
  }

  /** Tidies the whole board with a left-to-right layered layout, then frames the result. */
  readonly autoLayout = (): void => {
    if (this.session === null || this.locked) {
      return;
    }

    this.session.autoLayout();
    this.commit();
    void this.flow?.fitView();
  };

  readonly toggleLock = (): void => {
    this.locked = !this.locked;
    this.renderApp();
  };

  /** Snapshots visible nodes and edges into a PDF written next to the roadmap file. */
  async exportPdf(): Promise<void> {
    const file = this.file;
    const viewport = this.contentEl.querySelector<HTMLElement>(`.${RF_VIEWPORT_CLASS}`);
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

  /** Writes the board to a `.canvas` (JSON Canvas) file next to the roadmap. Lossy by design. */
  async exportCanvas(): Promise<void> {
    const file = this.file;

    if (this.session === null || file === null) {
      return;
    }

    try {
      const canvas = serializeCanvas(roadmapToCanvas(this.session.state));
      const path = availableVaultPath(this.app.vault, file.parent?.path, file.basename, "canvas");

      await this.app.vault.create(path, canvas);
      new Notice(`Exported Canvas: ${path}`);
    } catch (error) {
      new Notice(`Failed to export Canvas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  runAddNode(id: AddNodeActionId): void {
    const placement = this.canvasCenterPlacement();

    if (placement !== null) {
      this.runAddActionAt(id, placement);
    }
  }

  private readonly runAddActionAt = (id: AddNodeActionId, placement: NodePlacement): void => {
    const ctx = this.editableContext();

    if (ctx !== null) {
      runAddNodeAction(id, ctx, this.noteFolder(), placement);
    }
  };

  private canvasCenter(): NodePlacement | null {
    if (this.flow === null) {
      return null;
    }

    const rect = this.contentEl.getBoundingClientRect();

    return this.flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }

  private canvasCenterPlacement(): NodePlacement | null {
    const center = this.canvasCenter();

    return center === null ? null : centeredPlacement(center);
  }

  private readonly handleFlowInit = (instance: RoadmapFlowInstance | null): void => {
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

    const state = this.session.state;
    const nodes: RoadmapNode[] = [];
    const clusters: RoadmapCluster[] = [];
    const taken = new Set<string>();

    for (const id of this.selectedNodeIds) {
      const cluster = state.clusters[id];

      if (cluster !== undefined) {
        clusters.push(cluster);

        /* A selected cluster stands in for its members (they are dropped from the
           selection), so the whole group is copied: members keep relative layout. */
        for (const node of Object.values(state.nodes)) {
          if (node.clusterId === id && !taken.has(node.id)) {
            taken.add(node.id);
            nodes.push(node);
          }
        }

        continue;
      }

      const node = state.nodes[id];

      if (node !== undefined && !taken.has(node.id)) {
        taken.add(node.id);
        nodes.push(this.withAbsoluteLayout(node));
      }
    }

    if (nodes.length > 0 || clusters.length > 0) {
      const ids = new Set([...nodes.map((node) => node.id), ...clusters.map((cluster) => cluster.id)]);

      this.host.setClipboard({
        boardId: state.id,
        nodes,
        clusters,
        edges: Object.values(state.edges).filter((edge) => ids.has(edge.from.id) && ids.has(edge.to.id)),
        pasteOffset: 0,
      });
    }
  }

  private pasteClipboard(): void {
    const clipboard = this.host.getClipboard();

    if (
      this.session === null ||
      this.locked ||
      clipboard === null ||
      (clipboard.nodes.length === 0 && clipboard.clusters.length === 0)
    ) {
      return;
    }

    clipboard.pasteOffset += CASCADE_OFFSET;
    const copiedClusterIds = new Set(clipboard.clusters.map((cluster) => cluster.id));
    const loose = clipboard.nodes.filter((node) => node.clusterId == null || !copiedClusterIds.has(node.clusterId));
    const shift = this.pasteShift(clipboard, [...loose, ...clipboard.clusters]);
    const cloneIds = new Map<string, string>();
    const clusterClones = clipboard.clusters.map((cluster) => {
      const clone = copyCluster(cluster, cluster.layout.x + shift.x, cluster.layout.y + shift.y);

      cloneIds.set(cluster.id, clone.id);

      return clone;
    });
    const clones = clipboard.nodes.map((node) => {
      /* Members of a copied cluster keep their relative layout and follow the cluster
         frame; loose nodes carry absolute coordinates and take the shift themselves. */
      const memberOf = node.clusterId == null ? undefined : cloneIds.get(node.clusterId);
      const clone =
        memberOf === undefined
          ? copyNode(node, node.layout.x + shift.x, node.layout.y + shift.y)
          : copyNode(node, node.layout.x, node.layout.y);

      if (memberOf !== undefined) {
        clone.clusterId = memberOf;
      }

      cloneIds.set(node.id, clone.id);

      return clone;
    });

    this.session.addNodes(clones, copiedEdges(clipboard.edges, cloneIds), clusterClones);
    this.focusNodes([...clones.map((node) => node.id), ...clusterClones.map((cluster) => cluster.id)]);
    this.commit();
  }

  /** Same-board pastes fan out next to the originals; a paste into another board keeps
   * the copied arrangement but recenters its top-level frames on the viewport — the
   * source coordinates mean nothing there and could land far off-screen. */
  private pasteShift(clipboard: BoardClipboard, frames: ReadonlyArray<Pick<RoadmapNode, "layout">>): NodePlacement {
    const cascade = clipboard.pasteOffset;

    if (this.session === null || clipboard.boardId === this.session.state.id) {
      return { x: cascade, y: cascade };
    }

    const center = this.canvasCenter();

    if (center === null) {
      return { x: cascade, y: cascade };
    }

    const shift = centerNodesShift(frames, center);

    return { x: shift.x + cascade, y: shift.y + cascade };
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

    const cloneIds = new Map<string, string>();
    const clones: RoadmapNode[] = [];

    for (const { id, x, y } of items) {
      const node = this.session.state.nodes[id];

      if (node !== undefined) {
        const clone = copyNode(node, x, y);

        cloneIds.set(id, clone.id);
        clones.push(clone);
      }
    }

    this.session.addNodes(clones, copiedEdges(Object.values(this.session.state.edges), cloneIds));
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
      if (!this.locked) {
        promptEditText(ctx, id);
      }

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

  private readonly mountPreview = (node: RoadmapNode, el: HTMLElement, onRendered: () => void): (() => void) =>
    mountPreviewContent(this.app, node, el, onRendered);

  private readonly handlePaneContextMenu = (placement: NodePlacement, event: MouseEvent): void => {
    if (this.locked) {
      return;
    }

    showAddNodeMenu(this.runAddActionAt, centeredPlacement(placement), event);
  };

  /** The full add-node menu at the drop point; the created node is delivered to `sink`. */
  private showAddMenuWithSink(ctx: BoardContext, sink: NodeSink, placement: NodePlacement, event: MouseEvent): void {
    showAddNodeMenu(
      (id, at) => runAddNodeAction(id, ctx, this.noteFolder(), at, sink),
      centeredPlacement(placement),
      event,
    );
  }

  private readonly handleConnectToEmpty = (
    source: string,
    sourceHandle: string | null,
    placement: NodePlacement,
    event: MouseEvent,
  ): void => {
    const ctx = this.editableContext();

    if (ctx === null) {
      return;
    }

    this.showAddMenuWithSink(
      ctx,
      (node) => {
        ctx.session.addNodeWithEdge(node, source, sourceHandle, null);
        ctx.commit();
      },
      placement,
      event,
    );
  };

  /** Dropping an existing edge end on empty canvas breaks the edge. */
  private readonly handleReconnectToEmpty = (edgeId: string): void => {
    const ctx = this.editableContext();

    if (ctx === null) {
      return;
    }

    ctx.session.deleteElements([], [edgeId]);
    ctx.commit();
  };

  /** A selection containing clusters asks how to treat their nodes before deleting. */
  private readonly handleDeleteElements = (nodeIds: string[], edgeIds: string[]): void => {
    const ctx = this.editableContext();

    if (ctx === null || (nodeIds.length === 0 && edgeIds.length === 0)) {
      return;
    }

    const clusterIds = nodeIds.filter((id) => ctx.session.state.clusters[id] !== undefined);

    if (clusterIds.length === 0) {
      ctx.session.deleteElements(nodeIds, edgeIds);
      ctx.commit();

      return;
    }

    /* React Flow lists children of a deleted parent too; members of the clusters being
       deleted are governed by the dialog choice, not by the free-node list. */
    const clusterSet = new Set(clusterIds);
    const freeNodeIds = nodeIds.filter((id) => {
      const node = ctx.session.state.nodes[id];

      return node !== undefined && !clusterSet.has(node.clusterId ?? "");
    });
    const pick = (mode: "keep-nodes" | "with-nodes"): void => {
      ctx.session.deleteSelection(freeNodeIds, edgeIds, clusterIds, mode);
      ctx.commit();
    };

    new ChoiceModal(this.app, {
      title: clusterIds.length === 1 ? "Delete cluster" : "Delete clusters",
      message: "Vault files are not affected either way.",
      choices: [
        { label: "Keep nodes", onPick: () => pick("keep-nodes") },
        { label: "Delete nodes too", warning: true, onPick: () => pick("with-nodes") },
      ],
    }).open();
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
              locked={this.locked}
              canUndo={this.canUndoEdit()}
              canRedo={this.canRedoEdit()}
              initialDotsVisible={this.host.getShowBackgroundDots()}
              initialMiniMapVisible={this.host.getShowMiniMap()}
              openSearchNonce={this.searchOpenNonce}
              openFilterNonce={this.filterOpenNonce}
              focusIds={this.focusIds}
              focusNonce={this.focusNonce}
              isNodeMissing={this.isNodeMissing}
              resolveImageSrc={this.resolveImageSrc}
              nodeActions={this.nodeActions}
              edgeActions={this.edgeActions}
              clusterActions={this.clusterActions}
              boardActions={this.boardActions}
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
