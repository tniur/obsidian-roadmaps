import { Component, MarkdownRenderer, Notice, TFile, type App } from "obsidian";
import { IMAGE_EXTENSIONS } from "../domain/paths";
import { sourceFile } from "../domain/source";
import { setTaskMark } from "../markdown/tasks";
import type { RoadmapNode } from "../domain/types";

const TASK_CHECKBOX = "input.task-list-item-checkbox";

/**
 * Renders a node's source content into `el` for the preview panel: markdown through the
 * Obsidian renderer, images directly, attachments as an embed (so PDF/audio/video get
 * the native viewer). Task checkboxes in rendered markdown persist back to the source
 * note; the rest stays read-only. Calls `onRendered` once markdown content is in place
 * (lets the panel restore its scroll position across refreshes). Returns the cleanup
 * releasing the render component.
 */
export function mountPreviewContent(app: App, node: RoadmapNode, el: HTMLElement, onRendered?: () => void): () => void {
  const component = new Component();

  component.load();

  if (node.source.type === "url") {
    el.createEl("a", { text: node.source.url, href: node.source.url });

    return () => component.unload();
  }

  const path = sourceFile(node.source);
  const file = path === null ? null : app.vault.getAbstractFileByPath(path);

  if (!(file instanceof TFile)) {
    el.setText("Source file not found.");

    return () => component.unload();
  }

  if (node.source.type === "image" || IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
    el.createEl("img", {
      cls: "rm-preview__image",
      attr: { src: app.vault.getResourcePath(file) },
    });

    return () => component.unload();
  }

  if (node.source.type === "attachment") {
    void MarkdownRenderer.render(app, `![[${file.path}]]`, el, file.path, component);

    return () => component.unload();
  }

  component.registerDomEvent(el, "click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || !target.matches(TASK_CHECKBOX)) {
      return;
    }

    // Checkboxes inside embeds belong to other files; keep them inert rather than
    // letting them toggle without persisting.
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
        // The native toggle already happened; revert it so the checkbox keeps
        // reflecting the file when the write was refused.
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

  return () => component.unload();
}
