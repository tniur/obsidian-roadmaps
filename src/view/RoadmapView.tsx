import {
  Component,
  MarkdownRenderer,
  Menu,
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
import { sourceFile } from "../domain/source";
import type {
  EdgeDirection,
  EdgeLine,
  EdgeSide,
  RoadmapNode,
  RoadmapPriority,
  RoadmapStatus,
  TextAlignH,
  TextAlignV,
} from "../domain/types";
import {
  emptyState,
  reconcileState,
  readState,
  writeRelations,
  writeState,
} from "../state/document";
import { RoadmapSession, type NodeMetaPatch } from "../state/session";
import { FileSuggestModal } from "./FileSuggestModal";
import { NodePreviewPanel } from "./NodePreviewPanel";
import { PromptModal } from "./PromptModal";
import { RoadmapCanvas } from "./RoadmapCanvas";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);

export interface RoadmapViewHost {
  openAsMarkdown: (leaf: WorkspaceLeaf, file: TFile) => void;
  getShowBackgroundDots: () => boolean;
  setShowBackgroundDots: (value: boolean) => void;
}

type AppWithDragManager = App & {
  dragManager?: { draggable?: { file?: unknown; files?: unknown[] } };
};

const PASTE_OFFSET = 24;

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
    this.registerDomEvent(this.contentEl.ownerDocument, "keydown", this.handleKeyDown);
    this.registerEvent(this.app.vault.on("modify", this.handleVaultModify));
    this.renderApp();
  }

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

  private copySelection(): void {
    if (this.session === null) {
      return;
    }
    const nodes: RoadmapNode[] = [];
    for (const id of this.selectedNodeIds) {
      const node = this.session.state.nodes[id];
      if (node !== undefined) {
        nodes.push(node);
      }
    }
    if (nodes.length > 0) {
      this.clipboard = nodes;
      this.pasteOffset = 0;
    }
  }

  private pasteClipboard(): void {
    if (this.session === null || this.clipboard.length === 0) {
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
    return this.app.vault
      .getFiles()
      .filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()));
  }

  private attachmentFiles(): TFile[] {
    return this.app.vault.getFiles().filter((file) => {
      const ext = file.extension.toLowerCase();

      return ext !== "md" && !IMAGE_EXTENSIONS.has(ext);
    });
  }

  private nodeForFile(file: TFile, placement: NodePlacement): RoadmapNode {
    const ext = file.extension.toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      return createImageNode(file.path, placement);
    }
    if (ext === "md") {
      return createNoteNode(file.path, placement);
    }

    return createAttachmentNode(file.path, placement);
  }

  private readonly handleNodesDuplicated = (
    items: ReadonlyArray<{ id: string; x: number; y: number }>,
  ): void => {
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
    new FileSuggestModal(
      this.app,
      this.app.vault.getMarkdownFiles(),
      "Select a note to add",
      (file) => {
        this.session?.addNode(createNoteNode(file.path, placement));
        this.commit();
      },
    ).open();
  };

  private readonly handleAddImage = (placement: NodePlacement): void => {
    new FileSuggestModal(this.app, this.imageFiles(), "Select an image to add", (file) => {
      this.session?.addNode(createImageNode(file.path, placement));
      this.commit();
    }).open();
  };

  private readonly handleAddAttachment = (placement: NodePlacement): void => {
    new FileSuggestModal(
      this.app,
      this.attachmentFiles(),
      "Select an attachment to add",
      (file) => {
        this.session?.addNode(createAttachmentNode(file.path, placement));
        this.commit();
      },
    ).open();
  };

  private readonly handleCreateNote = (placement: NodePlacement): void => {
    void this.createNote(placement);
  };

  private normalizeUrl(value: string): string {
    return /^[a-z][\w+.-]*:\/\//i.test(value) ? value : `https://${value}`;
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
          new FileSuggestModal(
            this.app,
            this.app.vault.getMarkdownFiles(),
            "Select a note to add",
            (file) => {
              this.session?.addNodeWithEdge(
                createNoteNode(file.path, centered),
                source,
                sourceHandle,
                null,
              );
              this.commit();
            },
          ).open();
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
    const path = this.availableNotePath("Untitled Node");
    const file = await this.app.vault.create(path, "");
    this.session.addNodeWithEdge(createNoteNode(file.path, placement), source, sourceHandle, null);
    this.commit();
  }

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
      side =
        selfNode !== undefined && otherNode !== undefined
          ? facingSide(selfNode.layout, otherNode.layout)
          : "top";
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
    const colors: { title: string; value: string }[] = [
      { title: "Red", value: "var(--color-red)" },
      { title: "Orange", value: "var(--color-orange)" },
      { title: "Yellow", value: "var(--color-yellow)" },
      { title: "Green", value: "var(--color-green)" },
      { title: "Cyan", value: "var(--color-cyan)" },
      { title: "Blue", value: "var(--color-blue)" },
      { title: "Purple", value: "var(--color-purple)" },
      { title: "Pink", value: "var(--color-pink)" },
    ];
    menu.addItem((item) =>
      item
        .setTitle("No color")
        .setChecked(node.style?.color === undefined)
        .onClick(() => this.updateNodeMeta(id, { color: null })),
    );
    for (const { title, value } of colors) {
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
    menu.showAtMouseEvent(event);
  };

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
        this.nodeForFile(file, { x: placement.x + index * 24, y: placement.y + index * 24 }),
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
    const previewNode =
      this.previewNodeId === null ? undefined : this.session.state.nodes[this.previewNodeId];
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
              canUndo={this.session.canUndo}
              canRedo={this.session.canRedo}
              onUndo={this.undoEdit}
              onRedo={this.redoEdit}
              focusIds={this.focusIds}
              focusNonce={this.focusNonce}
              onNodesMoved={this.handleNodesMoved}
              onNodesDuplicate={this.handleNodesDuplicated}
              onNodeResized={this.handleNodeResized}
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
              onConnectToEmpty={this.handleConnectToEmpty}
              onEdgeContextMenu={this.handleEdgeContextMenu}
              onNodeContextMenu={this.handleNodeContextMenu}
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
