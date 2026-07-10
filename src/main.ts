import {
  addIcon,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  type App,
  type ViewState,
} from "obsidian";
import {
  BACKGROUND_DOTS_ICON_ID,
  ROADMAP_FRONTMATTER_KEY,
  ROADMAP_FRONTMATTER_VALUE,
  VIEW_TYPE_ROADMAP,
} from "./constants";
import { canvasToState, parseCanvas } from "./domain/jsonCanvas";
import { availableVaultPath } from "./services/vaultFiles";
import { createRoadmapDocument, renderStateDocument } from "./state/document";
import { ADD_NODE_ACTIONS } from "./view/addNodeActions";
import { FileSuggestModal } from "./view/FileSuggestModal";
import { RoadmapView, type RoadmapViewHost } from "./view/RoadmapView";

const MARKDOWN_VIEW_TYPE = "markdown";

const BACKGROUND_DOTS_ICON =
  '<circle cx="22" cy="22" r="9" fill="currentColor"/><circle cx="50" cy="22" r="9" fill="currentColor"/><circle cx="78" cy="22" r="9" fill="currentColor"/><circle cx="22" cy="50" r="9" fill="currentColor"/><circle cx="50" cy="50" r="9" fill="currentColor"/><circle cx="78" cy="50" r="9" fill="currentColor"/><circle cx="22" cy="78" r="9" fill="currentColor"/><circle cx="50" cy="78" r="9" fill="currentColor"/><circle cx="78" cy="78" r="9" fill="currentColor"/>';

type LeafWithId = WorkspaceLeaf & { id?: string };

/** Roadmap title from its vault path: the file name without its folder or extension. */
function titleFromPath(path: string): string {
  return path.replace(/\.md$/, "").replace(/^.*\//, "");
}

type ViewMode = typeof MARKDOWN_VIEW_TYPE | typeof VIEW_TYPE_ROADMAP;

interface RoadmapSettings {
  showBackgroundDots: boolean;
  showMiniMap: boolean;
  /** Folder new roadmaps are created in; empty means the vault root. */
  newRoadmapFolder: string;
}

const DEFAULT_SETTINGS: RoadmapSettings = {
  showBackgroundDots: true,
  showMiniMap: true,
  newRoadmapFolder: "",
};

export default class RoadmapPlugin extends Plugin {
  private readonly fileModes: Record<string, ViewMode> = {};
  private displaySettings: RoadmapSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    addIcon(BACKGROUND_DOTS_ICON_ID, BACKGROUND_DOTS_ICON);

    this.registerView(VIEW_TYPE_ROADMAP, (leaf) => new RoadmapView(leaf, this.createViewHost()));
    this.addSettingTab(new RoadmapSettingTab(this.app, this));
    this.patchLeafViewState();

    this.addRibbonIcon("map", "Create roadmap", () => {
      void this.createRoadmap();
    });

    this.registerCommands();

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file, _source, leaf) => {
        if (!(file instanceof TFile) || !this.isRoadmapFile(file)) {
          return;
        }

        if (!(leaf?.view instanceof MarkdownView)) {
          return;
        }

        menu.addItem((item) =>
          item
            .setSection("pane")
            .setTitle("Open as roadmap")
            .setIcon("map")
            .onClick(() => {
              this.openAsRoadmap(leaf, file);
            }),
        );
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "canvas") {
          return;
        }

        menu.addItem((item) =>
          item
            .setSection("action")
            .setTitle("Create roadmap from Canvas")
            .setIcon("file-json")
            .onClick(() => {
              void this.createRoadmapFromCanvas(file);
            }),
        );
      }),
    );
  }

  private registerCommands(): void {
    this.addCommand({
      id: "create-roadmap",
      name: "Create roadmap",
      icon: "map",
      callback: () => {
        void this.createRoadmap();
      },
    });

    this.addCommand({
      id: "import-canvas",
      name: "Create roadmap from Canvas",
      icon: "file-json",
      callback: () => {
        this.importCanvas();
      },
    });

    this.addCommand({
      id: "open-as-roadmap",
      name: "Open as roadmap",
      icon: "map",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const file = view?.file ?? null;

        if (view === null || file === null || !this.isRoadmapFile(file)) {
          return false;
        }

        if (!checking) {
          this.openAsRoadmap(view.leaf, file);
        }

        return true;
      },
    });

    this.addCommand({
      id: "open-as-markdown",
      name: "Open as Markdown",
      icon: "file-text",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(RoadmapView);
        const file = view?.file ?? null;

        if (view === null || file === null) {
          return false;
        }

        if (!checking) {
          this.openAsMarkdown(view.leaf, file);
        }

        return true;
      },
    });

    for (const { id, label, icon } of ADD_NODE_ACTIONS) {
      this.addBoardCommand(
        id,
        label,
        icon,
        (view) => view.isBoardEditable(),
        (view) => view.runAddNode(id),
      );
    }

    this.addBoardCommand(
      "undo",
      "Undo",
      "undo-2",
      (view) => view.canUndoEdit(),
      (view) => view.undoEdit(),
    );
    this.addBoardCommand(
      "redo",
      "Redo",
      "redo-2",
      (view) => view.canRedoEdit(),
      (view) => view.redoEdit(),
    );
    this.addBoardCommand(
      "search-nodes",
      "Search nodes",
      "search",
      (view) => view.isBoardLoaded(),
      (view) => view.openSearch(),
    );
    this.addBoardCommand(
      "filter-nodes",
      "Filter nodes",
      "filter",
      (view) => view.isBoardLoaded(),
      (view) => view.openFilter(),
    );
    this.addBoardCommand(
      "fit-view",
      "Fit to nodes",
      "frame",
      (view) => view.isBoardLoaded(),
      (view) => view.fitToNodes(),
    );
    this.addBoardCommand(
      "auto-layout",
      "Auto-layout board",
      "network",
      (view) => view.isBoardEditable(),
      (view) => view.autoLayout(),
    );
    this.addBoardCommand(
      "toggle-lock",
      "Toggle board lock",
      "lock",
      (view) => view.isBoardLoaded(),
      (view) => view.toggleLock(),
    );
    this.addBoardCommand(
      "export-pdf",
      "Export as PDF",
      "file-down",
      (view) => view.isBoardLoaded(),
      (view) => {
        void view.exportPdf();
      },
    );
    this.addBoardCommand(
      "export-canvas",
      "Export as JSON Canvas",
      "file-json",
      (view) => view.isBoardLoaded(),
      (view) => {
        void view.exportCanvas();
      },
    );
  }

  /** Registers a command that applies only while a roadmap view is active. */
  private addBoardCommand(
    id: string,
    name: string,
    icon: string,
    available: (view: RoadmapView) => boolean,
    run: (view: RoadmapView) => void,
  ): void {
    this.addCommand({
      id,
      name,
      icon,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(RoadmapView);

        if (view === null || !available(view)) {
          return false;
        }

        if (!checking) {
          run(view);
        }

        return true;
      },
    });
  }

  getShowBackgroundDots(): boolean {
    return this.displaySettings.showBackgroundDots;
  }

  setShowBackgroundDots(value: boolean): void {
    this.displaySettings.showBackgroundDots = value;
    void this.saveSettings();
  }

  getShowMiniMap(): boolean {
    return this.displaySettings.showMiniMap;
  }

  setShowMiniMap(value: boolean): void {
    this.displaySettings.showMiniMap = value;
    void this.saveSettings();
  }

  getNewRoadmapFolder(): string {
    return this.displaySettings.newRoadmapFolder;
  }

  setNewRoadmapFolder(value: string): void {
    this.displaySettings.newRoadmapFolder = value.replace(/^\/+|\/+$/g, "").trim();
    void this.saveSettings();
  }

  private createViewHost(): RoadmapViewHost {
    return {
      openAsMarkdown: this.openAsMarkdown,
      getShowBackgroundDots: () => this.getShowBackgroundDots(),
      setShowBackgroundDots: (value) => {
        this.setShowBackgroundDots(value);
      },
      getShowMiniMap: () => this.getShowMiniMap(),
      setShowMiniMap: (value) => {
        this.setShowMiniMap(value);
      },
    };
  }

  private async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<RoadmapSettings> | null;

    this.displaySettings = { ...DEFAULT_SETTINGS, ...data };
  }

  private async saveSettings(): Promise<void> {
    await this.saveData(this.displaySettings);
  }

  private isRoadmapFile(file: TFile): boolean {
    if (file.extension !== "md") {
      return false;
    }

    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

    return frontmatter?.[ROADMAP_FRONTMATTER_KEY] === ROADMAP_FRONTMATTER_VALUE;
  }

  private isRoadmapPath(path: string): boolean {
    if (!path.endsWith(".md")) {
      return false;
    }

    const frontmatter = this.app.metadataCache.getCache(path)?.frontmatter;

    return frontmatter?.[ROADMAP_FRONTMATTER_KEY] === ROADMAP_FRONTMATTER_VALUE;
  }

  /**
   * Roadmap boards are plain Markdown files, and Obsidian routes every `.md` file to the
   * core Markdown view; there is no public API to reroute view resolution by frontmatter.
   * Patching `WorkspaceLeaf.prototype.setViewState` — the approach established by
   * community plugins built on the same file-as-board pattern — redirects roadmap files
   * to the roadmap view in the same leaf. `fileModes` remembers leaves the user
   * explicitly switched to Markdown; `detach` drops that memory with the leaf, and the
   * guarded restore in `register` reverts both patches on unload unless another plugin
   * has patched over them since.
   */
  private patchLeafViewState(): void {
    const { fileModes } = this;
    const isRoadmapPath = (path: string): boolean => this.isRoadmapPath(path);
    const proto = WorkspaceLeaf.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the patch always invokes it via .call
    const originalSetViewState = proto.setViewState;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the patch always invokes it via .call
    const originalDetach = proto.detach;

    const patchedSetViewState = function (this: WorkspaceLeaf, viewState: ViewState, eState?: unknown): Promise<void> {
      const file = viewState.state?.file;

      if (viewState.type === MARKDOWN_VIEW_TYPE && typeof file === "string") {
        const key = (this as LeafWithId).id ?? file;

        if (fileModes[key] !== MARKDOWN_VIEW_TYPE && isRoadmapPath(file)) {
          fileModes[key] = VIEW_TYPE_ROADMAP;

          return originalSetViewState.call(this, { ...viewState, type: VIEW_TYPE_ROADMAP }, eState);
        }
      }

      return originalSetViewState.call(this, viewState, eState);
    };

    const patchedDetach = function (this: WorkspaceLeaf): void {
      const file = this.view?.getState()?.file;

      if (typeof file === "string") {
        delete fileModes[(this as LeafWithId).id ?? file];
      }

      return originalDetach.call(this);
    };

    proto.setViewState = patchedSetViewState;
    proto.detach = patchedDetach;

    this.register(() => {
      if (proto.setViewState === patchedSetViewState) {
        proto.setViewState = originalSetViewState;
      }

      if (proto.detach === patchedDetach) {
        proto.detach = originalDetach;
      }
    });
  }

  private openAsRoadmap(leaf: WorkspaceLeaf, file: TFile): void {
    this.fileModes[(leaf as LeafWithId).id ?? file.path] = VIEW_TYPE_ROADMAP;
    void leaf.setViewState({
      type: VIEW_TYPE_ROADMAP,
      active: true,
      state: { file: file.path },
    });
  }

  /** Focus lands on the editor right away, so keyboard shortcuts (undo, search) work
   * without an extra click into the text. */
  private readonly openAsMarkdown = (leaf: WorkspaceLeaf, file: TFile): void => {
    this.fileModes[(leaf as LeafWithId).id ?? file.path] = MARKDOWN_VIEW_TYPE;
    void leaf
      .setViewState({
        type: MARKDOWN_VIEW_TYPE,
        active: true,
        state: { file: file.path },
      })
      .then(() => {
        if (leaf.view instanceof MarkdownView) {
          leaf.view.editor.focus();
        }
      });
  };

  private async createRoadmap(): Promise<void> {
    try {
      const folder = await this.resolveNewRoadmapFolder();
      const path = availableVaultPath(this.app.vault, folder, "Untitled Roadmap", "md");

      await this.createAndOpenRoadmap(path, createRoadmapDocument(titleFromPath(path)));
    } catch (error) {
      new Notice(`Failed to create roadmap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Creates a roadmap file, opens it as a board in a new leaf and reveals it. */
  private async createAndOpenRoadmap(path: string, content: string): Promise<void> {
    const file = await this.app.vault.create(path, content);
    const leaf = this.app.workspace.getLeaf(true);

    this.openAsRoadmap(leaf, file);
    await this.app.workspace.revealLeaf(leaf);
  }

  /** Picks a `.canvas` file and imports it into a new roadmap created next to it. */
  private importCanvas(): void {
    const files = this.app.vault.getFiles().filter((file) => file.extension === "canvas");

    if (files.length === 0) {
      new Notice("No .canvas files found in the vault.");

      return;
    }

    new FileSuggestModal(this.app, files, "Select a canvas to import", (file) => {
      void this.createRoadmapFromCanvas(file);
    }).open();
  }

  private async createRoadmapFromCanvas(canvasFile: TFile): Promise<void> {
    try {
      const state = canvasToState(parseCanvas(await this.app.vault.read(canvasFile)));
      const path = availableVaultPath(this.app.vault, canvasFile.parent?.path, canvasFile.basename, "md");

      await this.createAndOpenRoadmap(path, renderStateDocument(state, titleFromPath(path)));
      new Notice(`Imported roadmap: ${path}`);
    } catch (error) {
      new Notice(`Failed to import canvas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** The configured target folder, created on demand; empty setting keeps roadmaps at the root. */
  private async resolveNewRoadmapFolder(): Promise<string | undefined> {
    const folder = this.displaySettings.newRoadmapFolder;

    if (folder === "") {
      return undefined;
    }

    if (this.app.vault.getAbstractFileByPath(folder) === null) {
      await this.app.vault.createFolder(folder);
    }

    return folder;
  }
}

class RoadmapSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: RoadmapPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Show background dots")
      .setDesc("Draw the dotted grid behind roadmap boards. Newly opened boards pick up the change.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getShowBackgroundDots()).onChange((value) => {
          this.plugin.setShowBackgroundDots(value);
        }),
      );

    new Setting(this.containerEl)
      .setName("Show mini-map")
      .setDesc("Draw the mini-map overview on roadmap boards. Newly opened boards pick up the change.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.getShowMiniMap()).onChange((value) => {
          this.plugin.setShowMiniMap(value);
        }),
      );

    new Setting(this.containerEl)
      .setName("Folder for new roadmaps")
      .setDesc("Where the ribbon and command create new roadmaps. Leave empty for the vault root.")
      .addText((text) =>
        text
          .setPlaceholder("Vault root")
          .setValue(this.plugin.getNewRoadmapFolder())
          .onChange((value) => {
            this.plugin.setNewRoadmapFolder(value);
          }),
      );
  }
}
