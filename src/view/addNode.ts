import { Notice, type TFile } from "obsidian";
import {
  createAttachmentNode,
  createImageNode,
  createNoteNode,
  createTextNode,
  createUrlNode,
  type NodePlacement,
} from "../domain/create";
import { normalizeHttpUrl } from "../domain/paths";
import { attachmentFiles, availableVaultPath, imageFiles } from "../services/vaultFiles";
import type { BoardContext } from "./boardContext";
import { FileSuggestModal } from "./FileSuggestModal";
import { PromptModal } from "./PromptModal";

const NEW_NOTE_BASENAME = "Untitled Node";

async function createEmptyNote(ctx: BoardContext, folder: string | undefined): Promise<TFile | null> {
  try {
    return await ctx.app.vault.create(availableVaultPath(ctx.app.vault, folder, NEW_NOTE_BASENAME, "md"), "");
  } catch (error) {
    new Notice(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`);

    return null;
  }
}

export async function createNewNote(
  ctx: BoardContext,
  folder: string | undefined,
  placement: NodePlacement,
): Promise<void> {
  const file = await createEmptyNote(ctx, folder);

  if (file === null) {
    return;
  }

  ctx.session.addNode(createNoteNode(file.path, placement));
  ctx.commit();
}

export async function createNewNoteWithEdge(
  ctx: BoardContext,
  folder: string | undefined,
  fromId: string,
  fromHandle: string | null,
  placement: NodePlacement,
): Promise<void> {
  const file = await createEmptyNote(ctx, folder);

  if (file === null) {
    return;
  }

  ctx.session.addNodeWithEdge(createNoteNode(file.path, placement), fromId, fromHandle, null);
  ctx.commit();
}

export function addExistingNote(ctx: BoardContext, placement: NodePlacement): void {
  new FileSuggestModal(ctx.app, ctx.app.vault.getMarkdownFiles(), "Select a note to add", (file) => {
    ctx.session.addNode(createNoteNode(file.path, placement));
    ctx.commit();
  }).open();
}

export function addExistingNoteWithEdge(
  ctx: BoardContext,
  fromId: string,
  fromHandle: string | null,
  placement: NodePlacement,
): void {
  new FileSuggestModal(ctx.app, ctx.app.vault.getMarkdownFiles(), "Select a note to add", (file) => {
    ctx.session.addNodeWithEdge(createNoteNode(file.path, placement), fromId, fromHandle, null);
    ctx.commit();
  }).open();
}

export function addExistingImage(ctx: BoardContext, placement: NodePlacement): void {
  new FileSuggestModal(ctx.app, imageFiles(ctx.app.vault), "Select an image to add", (file) => {
    ctx.session.addNode(createImageNode(file.path, placement));
    ctx.commit();
  }).open();
}

export function addExistingAttachment(ctx: BoardContext, placement: NodePlacement): void {
  new FileSuggestModal(ctx.app, attachmentFiles(ctx.app.vault), "Select an attachment to add", (file) => {
    ctx.session.addNode(createAttachmentNode(file.path, placement));
    ctx.commit();
  }).open();
}

export function addUrlNode(ctx: BoardContext, placement: NodePlacement): void {
  new PromptModal(ctx.app, {
    title: "Add URL",
    placeholder: "https://example.com",
    cta: "Add",
    onSubmit: (value) => {
      if (value.length === 0) {
        return;
      }

      ctx.session.addNode(createUrlNode(normalizeHttpUrl(value), placement));
      ctx.commit();
    },
  }).open();
}

export function addTextNode(ctx: BoardContext, placement: NodePlacement): void {
  new PromptModal(ctx.app, {
    title: "Add text",
    placeholder: "Text",
    cta: "Add",
    onSubmit: (value) => {
      if (value.length === 0) {
        return;
      }

      ctx.session.addNode(createTextNode(value, placement));
      ctx.commit();
    },
  }).open();
}
