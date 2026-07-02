import {
  Component,
  MarkdownRenderer,
  Menu,
  Notice,
  TextFileView,
  TFile,
  type App,
  type TAbstractFile,
  type WorkspaceLeaf,
} from "obsidian";
import { ReactFlowProvider } from "@xyflow/react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, VIEW_TYPE_ROADMAP } from "../constants";
import {
  copyNode,
  createAttachmentNode,
  createImageNode,
  createNoteNode,
  createTextNode,
  createUrlNode,
  type NodePlacement,
} from "../domain/create";
import { facingSide } from "../domain/edges";
import { nodeOpenTarget } from "../domain/openTarget";
import { fileKindForPath, IMAGE_EXTENSIONS } from "../domain/paths";
import { sourceFile } from "../domain/source";
import type {
  EdgeDirection,
  EdgeLine,
  EdgeSide,
  RoadmapCluster,
  RoadmapNode,
  RoadmapPriority,
  RoadmapStatus,
  RoadmapViewport,
  TextAlignH,
  TextAlignV,
} from "../domain/types";
import { isReservedHeading } from "../markdown/cluster";
import { StateVersionError } from "../state/codec";
import { loadDocument, rebuildDocument, type DocumentWarning, type LoadedDocument } from "../state/reconcile";
import { RoadmapSession, type NodeMetaPatch, type RoadmapConnection } from "../state/session";
import { FileSuggestModal } from "./FileSuggestModal";
import { NodePreviewPanel } from "./NodePreviewPanel";
import { PromptModal } from "./PromptModal";
import { RoadmapCanvas } from "./RoadmapCanvas";

const COLOR_OPTIONS: { title: string; value: string }[] = [
  { title: "Red", value: "var(--color-red)" },
  { title: "Orange", value: "var(--color-orange)" },
  { title: "Yellow", value: "var(--color-yellow)" },
  { title: "Green", value: "var(--color-green)" },
  { title: "Cyan", value: "var(--color-cyan)" },
  { title: "Blue", value: "var(--color-blue)" },
  { title: "Purple", value: "var(--color-purple)" },
  { title: "Pink", value: "var(--color-pink)" },
];

export interface RoadmapViewHost {
  openAsMarkdown: (leaf: WorkspaceLeaf, file: TFile) => void;
  getShowBackgroundDots: () => boolean;
  setShowBackgroundDots: (value: boolean) => void;
}

type AppWithDragManager = App & {
  dragManager?: { draggable?: { file?: unknown; files?: unknown[] } };
};

const PASTE_OFFSET = 24;

const VIEWPORT_SAVE_DELAY = 600;

const SAFE_URL_RE = /^(https?|obsidian):\/\//i;

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

  private readonly undoEdit = (): void => {
    if (this.session?.undo() === true) {
      this.commit();
    }
  };

  private readonly redoEdit = (): void => {
    if (this.session?.redo() === true) {
      this.commit();
    }
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

    this.pasteOffset += PASTE_OFFSET;
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

  private imageFiles(): TFile[] {
    return this.app.vault.getFiles().filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()));
  }

  private attachmentFiles(): TFile[] {
    return this.app.vault.getFiles().filter((file) => {
      const ext = file.extension.toLowerCase();

      return ext !== "md" && !IMAGE_EXTENSIONS.has(ext);
    });
  }

  private nodeForFile(file: TFile, placement: NodePlacement): RoadmapNode {
    switch (fileKindForPath(file.path)) {
      case "image":
        return createImageNode(file.path, placement);
      case "note":
        return createNoteNode(file.path, placement);
      case "attachment":
        return createAttachmentNode(file.path, placement);
    }
  }

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

  protected async onClose(): Promise<void> {
    if (this.viewportSaveTimer !== null) {
      window.clearTimeout(this.viewportSaveTimer);
      this.viewportSaveTimer = null;
    }

    this.root?.unmount();
    this.root = null;
  }

  private readonly handleToggleLock = (): void => {
    this.locked = !this.locked;
    this.renderApp();
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

  private showClusterContextMenu(cluster: RoadmapCluster, event: MouseEvent): void {
    const id = cluster.id;
    const collapsed = cluster.collapsed === true;
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle(collapsed ? "Expand" : "Collapse")
        .setIcon(collapsed ? "chevron-down" : "chevron-right")
        .onClick(() => this.handleClusterToggleCollapse(id)),
    );

    if (!collapsed) {
      menu.addItem((item) =>
        item
          .setTitle("Arrange nodes")
          .setIcon("layout-grid")
          .onClick(() => this.handleClusterArrange(id)),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Rename…")
        .setIcon("pencil")
        .onClick(() => this.renameCluster(cluster)),
    );
    menu.addItem((item) =>
      item
        .setTitle("No color")
        .setChecked(cluster.style?.color === undefined)
        .onClick(() => this.setClusterColor(id, null)),
    );

    for (const { title, value } of COLOR_OPTIONS) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(cluster.style?.color === value)
          .onClick(() => this.setClusterColor(id, value)),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Delete cluster (keep nodes)")
        .setIcon("ungroup")
        .onClick(() => {
          this.session?.dissolveCluster(id);
          this.commit();
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle("Delete cluster and its nodes")
        .setIcon("trash-2")
        .onClick(() => {
          this.session?.deleteClusterAndNodes(id);
          this.commit();
        }),
    );
    menu.showAtMouseEvent(event);
  }

  private setClusterColor(id: string, color: string | null): void {
    this.session?.setClusterColor(id, color);
    this.commit();
  }

  private renameCluster(cluster: RoadmapCluster): void {
    new PromptModal(this.app, {
      title: "Cluster name",
      placeholder: "Cluster",
      initialValue: cluster.title,
      cta: "Rename",
      onSubmit: (value) => {
        if (value.length === 0) {
          return;
        }

        if (isReservedHeading(value)) {
          new Notice(`"${value}" is a reserved section name.`);

          return;
        }

        this.session?.renameCluster(cluster.id, value);
        this.commit();
      },
    }).open();
  }

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
      if (SAFE_URL_RE.test(target.url)) {
        window.open(target.url);
      }

      return;
    }

    void this.app.workspace.openLinkText(target.linktext, this.file?.path ?? "", newLeaf);
  };

  private readonly handleNodePreview = (id: string): void => {
    const node = this.session?.state.nodes[id];

    if (node === undefined) {
      return;
    }

    if (node.source.type === "url") {
      this.handleNodeOpen(id, false);

      return;
    }

    if (node.source.type === "text") {
      this.editTextNode(id);

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

  private readonly renderPreviewContent = (node: RoadmapNode, el: HTMLElement): (() => void) => {
    const component = new Component();

    component.load();

    if (node.source.type === "url") {
      el.createEl("a", { text: node.source.url, href: node.source.url });

      return () => component.unload();
    }

    const path = sourceFile(node.source);
    const file = path === null ? null : this.app.vault.getAbstractFileByPath(path);

    if (!(file instanceof TFile)) {
      el.setText("Source file not found.");

      return () => component.unload();
    }

    if (node.source.type === "image" || IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
      el.createEl("img", {
        cls: "rm-preview__image",
        attr: { src: this.app.vault.getResourcePath(file) },
      });

      return () => component.unload();
    }

    if (node.source.type === "attachment") {
      void MarkdownRenderer.render(this.app, `![[${file.path}]]`, el, file.path, component);

      return () => component.unload();
    }

    void this.app.vault.cachedRead(file).then((markdown) => {
      void MarkdownRenderer.render(this.app, markdown, el, file.path, component);
    });

    return () => component.unload();
  };

  private readonly handleAddNote = (placement: NodePlacement): void => {
    new FileSuggestModal(this.app, this.app.vault.getMarkdownFiles(), "Select a note to add", (file) => {
      this.session?.addNode(createNoteNode(file.path, placement));
      this.commit();
    }).open();
  };

  private readonly handleAddImage = (placement: NodePlacement): void => {
    new FileSuggestModal(this.app, this.imageFiles(), "Select an image to add", (file) => {
      this.session?.addNode(createImageNode(file.path, placement));
      this.commit();
    }).open();
  };

  private readonly handleAddAttachment = (placement: NodePlacement): void => {
    new FileSuggestModal(this.app, this.attachmentFiles(), "Select an attachment to add", (file) => {
      this.session?.addNode(createAttachmentNode(file.path, placement));
      this.commit();
    }).open();
  };

  private readonly handleCreateNote = (placement: NodePlacement): void => {
    void this.createNote(placement);
  };

  private normalizeUrl(value: string): string {
    return SAFE_URL_RE.test(value) ? value : `https://${value}`;
  }

  private readonly handleAddUrl = (placement: NodePlacement): void => {
    new PromptModal(this.app, {
      title: "Add URL",
      placeholder: "https://example.com",
      cta: "Add",
      onSubmit: (value) => {
        if (value.length === 0 || this.session === null) {
          return;
        }

        this.session.addNode(createUrlNode(this.normalizeUrl(value), placement));
        this.commit();
      },
    }).open();
  };

  private readonly handleAddText = (placement: NodePlacement): void => {
    new PromptModal(this.app, {
      title: "Add text",
      placeholder: "Text",
      cta: "Add",
      onSubmit: (value) => {
        if (value.length === 0 || this.session === null) {
          return;
        }

        this.session.addNode(createTextNode(value, placement));
        this.commit();
      },
    }).open();
  };

  private editTextNode(id: string): void {
    const node = this.session?.state.nodes[id];

    if (node === undefined || node.source.type !== "text") {
      return;
    }

    new PromptModal(this.app, {
      title: "Edit text",
      placeholder: "Text",
      initialValue: node.title ?? "",
      cta: "Save",
      onSubmit: (value) => {
        if (value.length === 0) {
          return;
        }

        this.session?.updateNodeMeta(id, { title: value });
        this.commit();
      },
    }).open();
  }

  private editNodeUrl(id: string): void {
    const node = this.session?.state.nodes[id];

    if (node === undefined || node.source.type !== "url") {
      return;
    }

    new PromptModal(this.app, {
      title: "Node URL",
      placeholder: "https://example.com",
      initialValue: node.source.url,
      cta: "Save",
      onSubmit: (value) => {
        if (value.length === 0) {
          return;
        }

        this.session?.setNodeUrl(id, this.normalizeUrl(value));
        this.commit();
      },
    }).open();
  }

  private readonly handleCreateNodeAt = (placement: NodePlacement, event: MouseEvent): void => {
    if (this.locked) {
      return;
    }

    const centered: NodePlacement = {
      x: placement.x - DEFAULT_NODE_WIDTH / 2,
      y: placement.y - DEFAULT_NODE_HEIGHT / 2,
    };
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Create new note")
        .setIcon("file-plus")
        .onClick(() => this.handleCreateNote(centered)),
    );
    menu.addItem((item) =>
      item
        .setTitle("Add existing note")
        .setIcon("search")
        .onClick(() => this.handleAddNote(centered)),
    );
    menu.addItem((item) =>
      item
        .setTitle("Add URL")
        .setIcon("link")
        .onClick(() => this.handleAddUrl(centered)),
    );
    menu.addItem((item) =>
      item
        .setTitle("Add image")
        .setIcon("image")
        .onClick(() => this.handleAddImage(centered)),
    );
    menu.addItem((item) =>
      item
        .setTitle("Add text")
        .setIcon("type")
        .onClick(() => this.handleAddText(centered)),
    );
    menu.addItem((item) =>
      item
        .setTitle("Add attachment")
        .setIcon("paperclip")
        .onClick(() => this.handleAddAttachment(centered)),
    );
    menu.showAtMouseEvent(event);
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

  private readonly handleConnectToEmpty = (
    source: string,
    sourceHandle: string | null,
    placement: NodePlacement,
    event: MouseEvent,
  ): void => {
    const centered: NodePlacement = {
      x: placement.x - DEFAULT_NODE_WIDTH / 2,
      y: placement.y - DEFAULT_NODE_HEIGHT / 2,
    };
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Create new note")
        .setIcon("file-plus")
        .onClick(() => {
          void this.createNoteWithEdge(source, sourceHandle, centered);
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle("Add existing note")
        .setIcon("search")
        .onClick(() => {
          new FileSuggestModal(this.app, this.app.vault.getMarkdownFiles(), "Select a note to add", (file) => {
            this.session?.addNodeWithEdge(createNoteNode(file.path, centered), source, sourceHandle, null);
            this.commit();
          }).open();
        }),
    );
    menu.showAtMouseEvent(event);
  };

  private async createNoteWithEdge(
    source: string,
    sourceHandle: string | null,
    placement: NodePlacement,
  ): Promise<void> {
    if (this.session === null) {
      return;
    }

    let file: TFile;

    try {
      file = await this.app.vault.create(this.availableNotePath("Untitled Node"), "");
    } catch (error) {
      new Notice(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`);

      return;
    }

    this.session.addNodeWithEdge(createNoteNode(file.path, placement), source, sourceHandle, null);
    this.commit();
  }

  private readonly handleEdgeContextMenu = (id: string, event: MouseEvent): void => {
    const edge = this.session?.state.edges[id];

    if (edge === undefined || this.locked) {
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

    if (edge.direction === "forward") {
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle("Reverse direction")
          .setIcon("arrow-left-right")
          .onClick(() => this.reverseEdge(id)),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(edge.label === undefined ? "Add label" : "Edit label")
        .setIcon("type")
        .onClick(() => this.editEdgeLabel(id)),
    );

    if (edge.label !== undefined) {
      menu.addItem((item) =>
        item
          .setTitle("Remove label")
          .setIcon("x")
          .onClick(() => this.updateEdge(id, { label: "" })),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Float source")
        .setChecked(edge.fromSide === undefined)
        .onClick(() => this.toggleEdgeFloat(id, "from")),
    );
    menu.addItem((item) =>
      item
        .setTitle("Float target")
        .setChecked(edge.toSide === undefined)
        .onClick(() => this.toggleEdgeFloat(id, "to")),
    );
    menu.showAtMouseEvent(event);
  };

  private toggleEdgeFloat(id: string, end: "from" | "to"): void {
    const edge = this.session?.state.edges[id];

    if (edge === undefined) {
      return;
    }

    const floating = end === "from" ? edge.fromSide === undefined : edge.toSide === undefined;
    let side: EdgeSide | undefined;

    if (floating) {
      const self = edge[end];
      const other = end === "from" ? edge.to : edge.from;
      const selfNode = self.type === "node" ? this.session?.state.nodes[self.id] : undefined;
      const otherNode = other.type === "node" ? this.session?.state.nodes[other.id] : undefined;

      side = selfNode !== undefined && otherNode !== undefined ? facingSide(selfNode.layout, otherNode.layout) : "top";
    }

    this.session?.setEdgeEndpointSide(id, end, side);
    this.commit();
  }

  private reverseEdge(id: string): void {
    this.session?.reverseEdge(id);
    this.commit();
  }

  private editEdgeLabel(id: string): void {
    const edge = this.session?.state.edges[id];

    if (edge === undefined) {
      return;
    }

    new PromptModal(this.app, {
      title: edge.label === undefined ? "Add edge label" : "Edit edge label",
      placeholder: "Label text",
      initialValue: edge.label ?? "",
      cta: "Save",
      onSubmit: (value) => this.updateEdge(id, { label: value }),
    }).open();
  }

  private updateEdge(
    id: string,
    patch: { direction?: EdgeDirection; line?: EdgeLine | "solid"; label?: string },
  ): void {
    this.session?.updateEdge(id, patch);
    this.commit();
  }

  private readonly handleNodeContextMenu = (id: string, event: MouseEvent): void => {
    if (this.locked) {
      return;
    }

    const cluster = this.session?.state.clusters[id];

    if (cluster !== undefined) {
      this.showClusterContextMenu(cluster, event);

      return;
    }

    const node = this.session?.state.nodes[id];

    if (node === undefined) {
      return;
    }

    const align = node.align ?? { h: "left", v: "middle" };
    const menu = new Menu();
    const statuses: { title: string; value: RoadmapStatus }[] = [
      { title: "Draft", value: "draft" },
      { title: "In progress", value: "in-progress" },
      { title: "Done", value: "done" },
      { title: "Archived", value: "archived" },
    ];

    menu.addItem((item) =>
      item
        .setTitle("No status")
        .setChecked(node.status === undefined)
        .onClick(() => this.updateNodeMeta(id, { status: null })),
    );

    for (const { title, value } of statuses) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(node.status === value)
          .onClick(() => this.updateNodeMeta(id, { status: value })),
      );
    }

    menu.addSeparator();
    const priorities: { title: string; value: RoadmapPriority }[] = [
      { title: "Low priority", value: "low" },
      { title: "Medium priority", value: "medium" },
      { title: "High priority", value: "high" },
      { title: "Critical priority", value: "critical" },
    ];

    menu.addItem((item) =>
      item
        .setTitle("No priority")
        .setChecked(node.priority === undefined)
        .onClick(() => this.updateNodeMeta(id, { priority: null })),
    );

    for (const { title, value } of priorities) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(node.priority === value)
          .onClick(() => this.updateNodeMeta(id, { priority: value })),
      );
    }

    menu.addSeparator();
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

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("No color")
        .setChecked(node.style?.color === undefined)
        .onClick(() => this.updateNodeMeta(id, { color: null })),
    );

    for (const { title, value } of COLOR_OPTIONS) {
      menu.addItem((item) =>
        item
          .setTitle(title)
          .setChecked(node.style?.color === value)
          .onClick(() => this.updateNodeMeta(id, { color: value })),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Set title…")
        .setIcon("pencil")
        .onClick(() => this.editNodeText(id, "title")),
    );
    menu.addItem((item) =>
      item
        .setTitle("Set description…")
        .setIcon("text")
        .onClick(() => this.editNodeText(id, "description")),
    );

    if (node.source.type === "url") {
      menu.addItem((item) =>
        item
          .setTitle("Set URL…")
          .setIcon("link")
          .onClick(() => this.editNodeUrl(id)),
      );
    }

    if (node.source.type === "text") {
      menu.addItem((item) =>
        item
          .setTitle("Edit text…")
          .setIcon("type")
          .onClick(() => this.editTextNode(id)),
      );
    }

    if (node.clusterId == null) {
      const groupIds = this.selectedNodeIds.includes(id) ? this.selectedNodeIds : [id];

      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle("Group into cluster")
          .setIcon("group")
          .onClick(() => this.groupNodes(groupIds)),
      );
    }

    menu.showAtMouseEvent(event);
  };

  private readonly handleSelectionContextMenu = (ids: string[], event: MouseEvent): void => {
    if (this.locked) {
      return;
    }

    const targets = ids.filter((id) => this.session?.state.nodes[id]?.clusterId == null);

    if (targets.length === 0) {
      return;
    }

    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Group into cluster")
        .setIcon("group")
        .onClick(() => this.groupNodes(targets)),
    );
    menu.showAtMouseEvent(event);
  };

  private groupNodes(ids: readonly string[]): void {
    const targets = ids.filter((id) => this.session?.state.nodes[id]?.clusterId == null);

    if (this.session === null || targets.length === 0) {
      return;
    }

    new PromptModal(this.app, {
      title: "Cluster name",
      placeholder: "Cluster",
      cta: "Group",
      onSubmit: (value) => {
        if (isReservedHeading(value)) {
          new Notice(`"${value}" is a reserved section name.`);

          return;
        }

        this.session?.createClusterFromNodes(targets, value.length > 0 ? value : "Cluster");
        this.commit();
      },
    }).open();
  }

  private editNodeText(id: string, field: "title" | "description"): void {
    const node = this.session?.state.nodes[id];

    if (node === undefined) {
      return;
    }

    new PromptModal(this.app, {
      title: field === "title" ? "Node title" : "Node description",
      placeholder: field === "title" ? "Title (empty uses the file name)" : "Description",
      initialValue: (field === "title" ? node.title : node.description) ?? "",
      cta: "Save",
      onSubmit: (value) => this.updateNodeMeta(id, { [field]: value }),
    }).open();
  }

  private updateNodeAlign(id: string, patch: { h?: TextAlignH; v?: TextAlignV }): void {
    this.session?.setNodeAlign(id, patch);
    this.commit();
  }

  private updateNodeMeta(id: string, patch: NodeMetaPatch): void {
    this.session?.updateNodeMeta(id, patch);
    this.commit();
  }

  private readonly handleDropFiles = (placement: NodePlacement, dataTransfer: DataTransfer | null): void => {
    if (this.session === null || this.locked) {
      return;
    }

    const files = this.draggedFiles(dataTransfer);

    if (files.length === 0) {
      return;
    }

    files.forEach((file, index) => {
      this.session?.addNode(this.nodeForFile(file, { x: placement.x + index * 24, y: placement.y + index * 24 }));
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

    let file: TFile;

    try {
      file = await this.app.vault.create(this.availableNotePath("Untitled Node"), "");
    } catch (error) {
      new Notice(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`);

      return;
    }

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
              onToggleLock={this.handleToggleLock}
              onViewportChange={this.handleViewportChange}
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
              mount={this.renderPreviewContent}
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
