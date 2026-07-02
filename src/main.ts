import { addIcon, MarkdownView, Plugin, TFile, WorkspaceLeaf, type ViewState } from "obsidian";
import {
  BACKGROUND_DOTS_ICON_ID,
  ROADMAP_FRONTMATTER_KEY,
  ROADMAP_FRONTMATTER_VALUE,
  VIEW_TYPE_ROADMAP,
} from "./constants";
import { createRoadmapDocument } from "./state/document";
import { RoadmapView, type RoadmapViewHost } from "./view/RoadmapView";

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

export default class RoadmapPlugin extends Plugin {
  private readonly fileModes: Record<string, ViewMode> = {};
  private displaySettings: RoadmapSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    addIcon(BACKGROUND_DOTS_ICON_ID, BACKGROUND_DOTS_ICON);

    this.registerView(VIEW_TYPE_ROADMAP, (leaf) => new RoadmapView(leaf, this.createViewHost()));
    this.patchLeafViewState();

    this.addRibbonIcon("map", "Create roadmap", () => {
      void this.createRoadmap();
    });

    this.addCommand({
      id: "create-roadmap",
      name: "Create roadmap",
      callback: () => {
        void this.createRoadmap();
      },
    });

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

  private createViewHost(): RoadmapViewHost {
    return {
      openAsMarkdown: this.openAsMarkdown,
      getShowBackgroundDots: () => this.displaySettings.showBackgroundDots,
      setShowBackgroundDots: (value) => {
        this.displaySettings.showBackgroundDots = value;
        void this.saveSettings();
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
    const path = this.availablePath("Untitled Roadmap");
    const title = path.replace(/\.md$/, "");
    const file = await this.app.vault.create(path, createRoadmapDocument(title));
    const leaf = this.app.workspace.getLeaf(true);

    this.openAsRoadmap(leaf, file);
    await this.app.workspace.revealLeaf(leaf);
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
