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
import type { RoadmapNode } from "../domain/types";
import { attachmentFiles, availableVaultPath, imageFiles } from "../services/vaultFiles";
import type { BoardContext } from "./boardContext";
import { FileSuggestModal } from "./FileSuggestModal";
import { PromptModal } from "./PromptModal";

/**
 * Receives the node a flow below has built. The default sink inserts it standalone;
 * callers that need an edge attached in the same history step (connect-to-empty,
 * reconnect-to-empty) supply their own.
 */
export type NodeSink = (node: RoadmapNode) => void;

function standaloneSink(ctx: BoardContext): NodeSink {
  return (node) => {
    ctx.session.addNode(node);
    ctx.commit();
  };
}

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
  sink?: NodeSink,
): Promise<void> {
  const file = await createEmptyNote(ctx, folder);

  if (file === null) {
    return;
  }

  (sink ?? standaloneSink(ctx))(createNoteNode(file.path, placement));
}

export function addExistingNote(ctx: BoardContext, placement: NodePlacement, sink?: NodeSink): void {
  const deliver = sink ?? standaloneSink(ctx);

  new FileSuggestModal(ctx.app, ctx.app.vault.getMarkdownFiles(), "Select a note to add", (file) => {
    deliver(createNoteNode(file.path, placement));
  }).open();
}

export function addExistingImage(ctx: BoardContext, placement: NodePlacement, sink?: NodeSink): void {
  const deliver = sink ?? standaloneSink(ctx);

  new FileSuggestModal(ctx.app, imageFiles(ctx.app.vault), "Select an image to add", (file) => {
    deliver(createImageNode(file.path, placement));
  }).open();
}

export function addExistingAttachment(ctx: BoardContext, placement: NodePlacement, sink?: NodeSink): void {
  const deliver = sink ?? standaloneSink(ctx);

  new FileSuggestModal(ctx.app, attachmentFiles(ctx.app.vault), "Select an attachment to add", (file) => {
    deliver(createAttachmentNode(file.path, placement));
  }).open();
}

export function addUrlNode(ctx: BoardContext, placement: NodePlacement, sink?: NodeSink): void {
  const deliver = sink ?? standaloneSink(ctx);

  new PromptModal(ctx.app, {
    title: "Add URL node",
    placeholder: "https://example.com",
    cta: "Add",
    onSubmit: (value) => {
      if (value.length === 0) {
        return;
      }

      deliver(createUrlNode(normalizeHttpUrl(value), placement));
    },
  }).open();
}

export function addTextNode(ctx: BoardContext, placement: NodePlacement, sink?: NodeSink): void {
  const deliver = sink ?? standaloneSink(ctx);

  new PromptModal(ctx.app, {
    title: "Add text node",
    placeholder: "Text",
    cta: "Add",
    onSubmit: (value) => {
      if (value.length === 0) {
        return;
      }

      deliver(createTextNode(value, placement));
    },
  }).open();
}
