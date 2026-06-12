import { createContext, useContext } from "react";

export interface NodeCallbacks {
  onResizeEnd: (id: string, width: number, height: number, x: number, y: number) => void;
}

export const NodeCallbacksContext = createContext<NodeCallbacks | null>(null);

export function useNodeCallbacks(): NodeCallbacks | null {
  return useContext(NodeCallbacksContext);
}
