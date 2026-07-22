import { createContext, useContext } from "react";

export interface NodeCallbacks {
  locked: boolean;
  onResizeEnd: (id: string, width: number, height: number, x: number, y: number) => void;
  onClusterToggleCollapse: (id: string) => void;
  onClusterArrange: (id: string) => void;
}

export const NodeCallbacksContext = createContext<NodeCallbacks | null>(null);

export function useNodeCallbacks(): NodeCallbacks | null {
  return useContext(NodeCallbacksContext);
}

/** Node and cluster views hide their edit controls while the board is locked. */
export function canEditNode(callbacks: NodeCallbacks | null): boolean {
  return callbacks?.locked !== true;
}
