/**
 * CSS classes React Flow stamps on its own DOM. They are internal to @xyflow/react, not a
 * public API, so any code selecting on them is coupled to the library version — revisit
 * this file when bumping @xyflow/react. The floating-edge grip, the pane double-click zoom
 * and the PDF snapshot all depend on these staying put.
 */
export const RF_PANE_CLASS = "react-flow__pane";

export const RF_NODE_CLASS = "react-flow__node";

export const RF_EDGE_CLASS = "react-flow__edge";

export const RF_PANEL_CLASS = "react-flow__panel";

export const RF_VIEWPORT_CLASS = "react-flow__viewport";

/** The invisible reconnect anchor React Flow draws at an edge end. */
export function rfEdgeUpdaterClass(end: "source" | "target"): string {
  return `react-flow__edgeupdater-${end}`;
}
