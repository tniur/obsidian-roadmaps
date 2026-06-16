import type { ComponentType } from "react";
import type { RoadmapNodeKind } from "../domain/types";
import type { RoadmapNodeData } from "./flow";
import { ImageNodeBody } from "./ImageNodeBody";
import { NoteNodeBody } from "./NoteNodeBody";
import { UrlNodeBody } from "./UrlNodeBody";

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
registerNodeRenderer("url", UrlNodeBody);
registerNodeRenderer("image", ImageNodeBody);
