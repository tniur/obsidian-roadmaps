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
import { createRoadmapDocument } from "./state/document";
import { RoadmapView, type AddNodeCommand, type RoadmapViewHost } from "./view/RoadmapView";

const MARKDOWN_VIEW_TYPE = "markdown";

const BACKGROUND_DOTS_ICON =
  '<circle cx="22" cy="22" r="9" fill="currentColor"/><circle cx="50" cy="22" r="9" fill="currentColor"/><circle cx="78" cy="22" r="9" fill="currentColor"/><circle cx="22" cy="50" r="9" fill="currentColor"/><circle cx="50" cy="50" r="9" fill="currentColor"/><circle cx="78" cy="50" r="9" fill="currentColor"/><circle cx="22" cy="78" r="9" fill="currentColor"/><circle cx="50" cy="78" r="9" fill="currentColor"/><circle cx="78" cy="78" r="9" fill="currentColor"/>';

type LeafWithId = WorkspaceLeaf & { id?: string };

type ViewMode = typeof MARKDOWN_VIEW_TYPE | typeof VIEW_TYPE_ROADMAP;

interface RoadmapSettings {
  showBackgroundDots: boolean;
}

const DEFAULT_SETTINGS: RoadmapSettings = {
  showBackgroundDots: true,
};

const ADD_NODE_COMMANDS: ReadonlyArray<{ id: AddNodeCommand; name: string; icon: string }> = [
  { id: "create-note", name: "Create new note", icon: "file-plus" },
  { id: "add-note", name: "Add existing note", icon: "search" },
  { id: "add-url", name: "Add URL", icon: "link" },
  { id: "add-image", name: "Add image", icon: "image" },
  { id: "add-text", name: "Add text", icon: "type" },
  { id: "add-attachment", name: "Add attachment", icon: "paperclip" },
];

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

    for (const { id, name, icon } of ADD_NODE_COMMANDS) {
      this.addBoardCommand(
        id,
        name,
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
      "fit-view",
      "Fit to nodes",
      "frame",
      (view) => view.isBoardLoaded(),
      (view) => view.fitToNodes(),
    );
    this.addBoardCommand(
      "toggle-lock",
      "Toggle board lock",
      "lock",
      (view) => view.isBoardLoaded(),
      (view) => view.toggleLock(),
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

  private createViewHost(): RoadmapViewHost {
    return {
      openAsMarkdown: this.openAsMarkdown,
      getShowBackgroundDots: () => this.getShowBackgroundDots(),
      setShowBackgroundDots: (value) => {
        this.setShowBackgroundDots(value);
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
    const originalSetViewState = proto.setViewState;
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

  private readonly openAsMarkdown = (leaf: WorkspaceLeaf, file: TFile): void => {
    this.fileModes[(leaf as LeafWithId).id ?? file.path] = MARKDOWN_VIEW_TYPE;
    void leaf.setViewState({
      type: MARKDOWN_VIEW_TYPE,
      active: true,
      state: { file: file.path },
    });
  };

  private async createRoadmap(): Promise<void> {
    try {
      const path = this.availablePath("Untitled Roadmap");
      const title = path.replace(/\.md$/, "");
      const file = await this.app.vault.create(path, createRoadmapDocument(title));
      const leaf = this.app.workspace.getLeaf(true);

      this.openAsRoadmap(leaf, file);
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      new Notice(`Failed to create roadmap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private availablePath(base: string): string {
    if (this.app.vault.getAbstractFileByPath(`${base}.md`) === null) {
      return `${base}.md`;
    }

    let index = 1;

    while (this.app.vault.getAbstractFileByPath(`${base} ${index}.md`) !== null) {
      index += 1;
    }

    return `${base} ${index}.md`;
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
  }
}
