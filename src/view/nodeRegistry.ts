import type { ComponentType } from "react";
import type { RoadmapNodeKind } from "../domain/types";
import type { RoadmapNodeData } from "./flow";
import { NoteNodeBody } from "./NoteNodeBody";

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
