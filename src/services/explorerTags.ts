import type { App } from "obsidian";

const FILE_EXPLORER_VIEW_TYPE = "file-explorer";

const FILE_TITLE_SELECTOR = ".nav-file-title[data-path]";

const CORE_TAG_CLASS = "nav-file-tag";

const TAG_CLASS = "rm-nav-file-tag";

const TAG_TEXT = "roadmap";

/**
 * Tags roadmap entries in the file explorer the way Obsidian tags files whose extension is not
 * Markdown — a tag roadmaps never get, being plain `.md`. Decorative and best-effort: it reads the
 * explorer markup, and quietly tags nothing once that markup stops matching.
 */
export class ExplorerRoadmapTags {
  private observer: MutationObserver | null = null;

  private frame: number | null = null;

  private enabled = false;

  constructor(
    private readonly app: App,
    private readonly isRoadmapPath: (path: string) => boolean,
  ) {}

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;

    if (enabled) {
      this.refresh();
    } else {
      this.stop();
    }
  }

  /** Rescans the explorer; call when it remounts or when roadmap frontmatter may have changed. */
  refresh(): void {
    if (!this.enabled) {
      return;
    }

    this.observe();
    this.schedule();
  }

  destroy(): void {
    this.enabled = false;
    this.stop();
  }

  private stop(): void {
    this.observer?.disconnect();
    this.observer = null;

    if (this.frame !== null) {
      window.cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    for (const container of this.containers()) {
      for (const tag of container.querySelectorAll(`.${TAG_CLASS}`)) {
        tag.remove();
      }
    }
  }

  private containers(): HTMLElement[] {
    return this.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE).map((leaf) => leaf.view.containerEl);
  }

  private observe(): void {
    const containers = this.containers();

    if (containers.length === 0) {
      return;
    }

    const observer = (this.observer ??= new MutationObserver(() => {
      this.schedule();
    }));

    observer.disconnect();

    for (const container of containers) {
      observer.observe(container, { childList: true, subtree: true });
    }
  }

  private schedule(): void {
    if (this.frame !== null) {
      return;
    }

    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.apply();
    });
  }

  private apply(): void {
    for (const container of this.containers()) {
      for (const title of container.querySelectorAll<HTMLElement>(FILE_TITLE_SELECTOR)) {
        this.applyTo(title);
      }
    }
  }

  private applyTo(title: HTMLElement): void {
    const tag = title.querySelector(`.${TAG_CLASS}`);
    const tagged = this.isRoadmapPath(title.dataset.path ?? "");

    if (tagged && tag === null) {
      title.createDiv({ cls: [CORE_TAG_CLASS, TAG_CLASS], text: TAG_TEXT });
    } else if (!tagged && tag !== null) {
      tag.remove();
    }
  }
}
