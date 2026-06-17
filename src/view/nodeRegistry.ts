import type { ComponentType } from "react";
import type { RoadmapNodeKind } from "../domain/types";
import type { RoadmapNodeData } from "./flow";
import { iconTitleNodeBody } from "./IconTitleNodeBody";
import { ImageNodeBody } from "./ImageNodeBody";
import { NoteNodeBody } from "./NoteNodeBody";
import { TextNodeBody } from "./TextNodeBody";

export interface NodeBodyProps {
  data: RoadmapNodeData;
}

const registry = new Map<RoadmapNodeKind, ComponentType<NodeBodyProps>>();

export function registerNodeRenderer(
  kind: RoadmapNodeKind,
  renderer: ComponentType<NodeBodyProps>,
): void {
  registry.set(kind, renderer);
}

export function getNodeRenderer(kind: RoadmapNodeKind): ComponentType<NodeBodyProps> | null {
  return registry.get(kind) ?? null;
}

registerNodeRenderer("note", NoteNodeBody);
registerNodeRenderer("url", iconTitleNodeBody("link"));
registerNodeRenderer("image", ImageNodeBody);
registerNodeRenderer("text", TextNodeBody);
registerNodeRenderer("attachment", iconTitleNodeBody("paperclip"));
