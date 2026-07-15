import type { RoadmapNodeKind } from "../domain/types";

/** Lucide icon per node kind, shared by the preview header and the vault file pickers. */
export const KIND_ICONS: Record<RoadmapNodeKind, string> = {
  note: "file-text",
  heading: "heading",
  block: "pilcrow",
  text: "type",
  image: "image",
  attachment: "paperclip",
  url: "link",
};
