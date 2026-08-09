import type { NodePlacement } from "../../domain/create";
import type { RoadmapPriority, RoadmapStatus, TextAlignH, TextAlignV } from "../../domain/types";
import type { EdgeUpdatePatch } from "../../state/session";
import type { AddNodeActionId } from "../addNodeActions";

export interface NodeBulkPatch {
  status?: RoadmapStatus | null;
  priority?: RoadmapPriority | null;
  color?: string | null;
}

/**
 * Domain-side handlers behind the board's context menus (bubble toolbars and card
 * menus). The canvas renders the menus and stays free of session logic; the view
 * implements every action over the session, dialogs and vault.
 */
export interface CanvasMenuActions {
  setNodesMeta: (ids: readonly string[], patch: NodeBulkPatch, options?: { history?: boolean }) => void;
  setNodesAlign: (ids: readonly string[], patch: { h?: TextAlignH; v?: TextAlignV }) => void;
  setNodeTitle: (id: string, value: string) => void;
  setNodeDescription: (id: string, value: string) => void;
  setNodeUrl: (id: string, value: string) => void;
  setNodeText: (id: string, value: string) => void;
  duplicateNodes: (ids: readonly string[]) => void;
  deleteNodes: (ids: readonly string[]) => void;
  groupIntoCluster: (ids: readonly string[]) => void;
  updateEdge: (id: string, patch: EdgeUpdatePatch, options?: { history?: boolean }) => void;
  reverseEdge: (id: string) => void;
  setEdgeAnchored: (id: string, end: "from" | "to", anchored: boolean) => void;
  deleteEdge: (id: string) => void;
  renameCluster: (id: string, value: string) => void;
  setClusterColor: (id: string, color: string | null, options?: { history?: boolean }) => void;
  arrangeCluster: (id: string) => void;
  toggleClusterCollapsed: (id: string) => void;
  ungroupCluster: (id: string) => void;
  deleteCluster: (id: string) => void;
  addNodeAt: (action: AddNodeActionId, placement: NodePlacement) => void;
  connectNewNode: (
    action: AddNodeActionId,
    source: string,
    sourceHandle: string | null,
    placement: NodePlacement,
  ) => void;
}
