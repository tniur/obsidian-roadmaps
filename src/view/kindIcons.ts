import type { RoadmapNodeKind } from "../domain/types";

export const KIND_ICONS: Record<RoadmapNodeKind, string> = {
  note: "file-text",
  heading: "heading",
  block: "pilcrow",
  text: "type",
  image: "image",
  attachment: "paperclip",
  url: "link",
};
