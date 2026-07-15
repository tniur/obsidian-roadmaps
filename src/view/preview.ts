import { Component, MarkdownRenderer, Notice, setIcon, TFile, type App } from "obsidian";
import { IMAGE_EXTENSIONS, urlHostname } from "../domain/paths";
import { sourceFile } from "../domain/source";
import { setTaskMark } from "../markdown/tasks";
import type { RoadmapNode } from "../domain/types";

const TASK_CHECKBOX = "input.task-list-item-checkbox";

/**
 * Link card of a URL node built from local data only (no network fetches): an
 * accent thumb, the hostname with a letter tile standing in for a favicon, the custom
 * title when one is set, and the clickable address itself.
 */
function renderLinkCard(node: RoadmapNode, url: string, el: HTMLElement): void {
  const hostname = urlHostname(url);
  const thumb = el.createDiv({ cls: "rm-preview__link-thumb" });

  setIcon(thumb.createSpan({ cls: "rm-preview__link-glyph" }), "globe");

  const meta = el.createDiv({ cls: "rm-preview__link-meta" });
  const domainRow = meta.createDiv({ cls: "rm-preview__link-domain-row" });

  domainRow.createSpan({ cls: "rm-preview__link-favicon", text: hostname.charAt(0).toUpperCase() });
  domainRow.createSpan({ cls: "rm-preview__link-domain", text: hostname });

  if (node.title !== undefined && node.title.length > 0) {
    meta.createDiv({ cls: "rm-preview__link-title", text: node.title });
  }

  meta.createEl("a", { cls: "rm-preview__link-url", text: url, href: url });
}

/**
 * Renders a node's source into `el` with one view per content type: markdown through
 * the Obsidian renderer, images full-bleed, attachments as an embed (so PDF/audio/video
 * get the native viewer), URLs as a local link card and text nodes as large plain text.
 * The resolved view is exposed on the element as `data-preview-kind` for styling. Task
 * checkboxes in rendered markdown persist back to the source note; checkboxes inside
 * embeds belong to other files and stay inert, and a toggle the file refused is
 * reverted visually with a Notice. The rest stays read-only. Calls `onRendered` once
 * content is in place (lets the panel restore its scroll position across refreshes).
 * Returns the cleanup releasing the render component.
 */
export function mountPreviewContent(app: App, node: RoadmapNode, el: HTMLElement, onRendered?: () => void): () => void {
  const component = new Component();

  component.load();

  const cleanup = (): void => {
    delete el.dataset.previewKind;
    component.unload();
  };

  if (node.source.type === "url") {
    el.dataset.previewKind = "url";
    renderLinkCard(node, node.source.url, el);
    onRendered?.();

    return cleanup;
  }

  if (node.source.type === "text") {
    el.dataset.previewKind = "text";
    el.createDiv({ cls: "rm-preview__text", text: node.title ?? "" });
    onRendered?.();

    return cleanup;
  }

  const path = sourceFile(node.source);
  const file = path === null ? null : app.vault.getAbstractFileByPath(path);

  if (!(file instanceof TFile)) {
    el.dataset.previewKind = "missing";
    const missing = el.createDiv({ cls: "rm-preview__missing" });

    setIcon(missing.createSpan({ cls: "rm-preview__missing-icon" }), "file-question");
    missing.createSpan({ text: "Source file not found." });
    onRendered?.();

    return cleanup;
  }

  if (node.source.type === "image" || IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
    el.dataset.previewKind = "image";
    el.createEl("img", {
      cls: "rm-preview__image",
      attr: { src: app.vault.getResourcePath(file) },
    });
    onRendered?.();

    return cleanup;
  }

  if (node.source.type === "attachment") {
    el.dataset.previewKind = "attachment";
    void MarkdownRenderer.render(app, `![[${file.path}]]`, el, file.path, component).then(() => onRendered?.());

    return cleanup;
  }

  el.dataset.previewKind = "note";
  component.registerDomEvent(el, "click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || !target.matches(TASK_CHECKBOX)) {
      return;
    }

    if (target.closest(".internal-embed") !== null) {
      event.preventDefault();

      return;
    }

    const boxes = Array.from(el.querySelectorAll(TASK_CHECKBOX)).filter(
      (box) => box.closest(".internal-embed") === null,
    );
    const index = boxes.indexOf(target);
    const checked = target.checked;
    let applied = false;

    void app.vault
      .process(file, (content) => {
        const next = setTaskMark(content, index, checked);

        if (next === null) {
          return content;
        }

        applied = true;

        return next;
      })
      .then(() => {
        if (!applied) {
          target.checked = !checked;
          new Notice("Could not update the task — edit the note instead.");
        }
      });
  });

  void app.vault.cachedRead(file).then(async (markdown) => {
    await MarkdownRenderer.render(app, markdown, el, file.path, component);
    onRendered?.();
  });

  return cleanup;
}
