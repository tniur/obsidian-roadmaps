import { TFile, type App, type Vault } from "obsidian";
import { createAttachmentNode, createImageNode, createNoteNode, type NodePlacement } from "../domain/create";
import { fileKindForPath, IMAGE_EXTENSIONS } from "../domain/paths";
import type { RoadmapNode } from "../domain/types";

type AppWithDragManager = App & {
  dragManager?: { draggable?: { file?: unknown; files?: unknown[] } };
};

/**
 * First free `base.extension` path inside `folder` (vault root when undefined),
 * suffixing a counter when the plain name is taken.
 */
export function availableVaultPath(vault: Vault, folder: string | undefined, base: string, extension: string): string {
  const prefix = folder === undefined || folder === "" || folder === "/" ? "" : `${folder}/`;
  const stem = `${prefix}${base}`;

  if (vault.getAbstractFileByPath(`${stem}.${extension}`) === null) {
    return `${stem}.${extension}`;
  }

  let index = 1;

  while (vault.getAbstractFileByPath(`${stem} ${index}.${extension}`) !== null) {
    index += 1;
  }

  return `${stem} ${index}.${extension}`;
}

export function imageFiles(vault: Vault): TFile[] {
  return vault.getFiles().filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()));
}

export function attachmentFiles(vault: Vault): TFile[] {
  return vault.getFiles().filter((file) => {
    const ext = file.extension.toLowerCase();

    return ext !== "md" && !IMAGE_EXTENSIONS.has(ext);
  });
}

/** Node matching the file's kind: image or note by extension, attachment for the rest. */
export function nodeForFile(file: TFile, placement: NodePlacement): RoadmapNode {
  switch (fileKindForPath(file.path)) {
    case "image":
      return createImageNode(file.path, placement);
    case "note":
      return createNoteNode(file.path, placement);
    case "attachment":
      return createAttachmentNode(file.path, placement);
  }
}

/**
 * Files carried by a drag from the file explorer. Obsidian's drag manager is not part
 * of the public API, so the wikilink in the drop payload serves as a fallback.
 */
export function draggedFiles(app: App, dataTransfer: DataTransfer | null, sourcePath: string): TFile[] {
  const draggable = (app as AppWithDragManager).dragManager?.draggable;

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

  const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

  return file === null ? [] : [file];
}
