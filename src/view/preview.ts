import { Component, MarkdownRenderer, TFile, type App } from "obsidian";
import { IMAGE_EXTENSIONS } from "../domain/paths";
import { sourceFile } from "../domain/source";
import type { RoadmapNode } from "../domain/types";

/**
 * Renders a node's source content into `el` for the preview panel: markdown through the
 * Obsidian renderer, images directly, attachments as an embed (so PDF/audio/video get
 * the native viewer). Returns the cleanup releasing the render component.
 */
export function mountPreviewContent(app: App, node: RoadmapNode, el: HTMLElement): () => void {
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

  void app.vault.cachedRead(file).then((markdown) => {
    void MarkdownRenderer.render(app, markdown, el, file.path, component);
  });

  return () => component.unload();
}
