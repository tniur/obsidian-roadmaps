import { NodeResizeControl, ResizeControlVariant, type NodeProps, type ResizeParams } from "@xyflow/react";
import type { MouseEvent } from "react";
import { MIN_CLUSTER_HEIGHT, MIN_CLUSTER_WIDTH } from "../constants";
import { colorStyleVars } from "./colorStyle";
import type { RoadmapClusterNode } from "./flow";
import { Icon } from "./Icon";
import { useNodeCallbacks } from "./nodeCallbacks";
import { useFilterActive } from "./nodeFilterContext";
import { NodeHandles } from "./NodeHandles";

/** Resize handles confined to the right/bottom edges keep the cluster origin fixed, so member
 * nodes (positioned relative to it) stay put while the container grows. */
const RESIZE_EDGES = ["right", "bottom", "bottom-right"] as const;

/**
 * Cluster container renderer, wrapped in the same no-box color-variable shell as cards.
 * An expanded empty cluster shows a dashed drop placeholder instead of a body.
 */
export function ClusterNodeView({ id, data, selected, isConnectable }: NodeProps<RoadmapClusterNode>) {
  const cluster = data;
  const callbacks = useNodeCallbacks();
  const dimmed = useFilterActive();
  const collapsed = cluster.collapsed;
  const colorStyle = colorStyleVars("--rm-cluster-color", cluster.color);
  const showResize = selected === true && callbacks?.locked !== true && !collapsed;
  const onResizeEnd = (_event: unknown, params: ResizeParams): void => {
    callbacks?.onResizeEnd(id, params.width, params.height, params.x, params.y);
  };
  const onToggle = (event: MouseEvent): void => {
    event.stopPropagation();
    callbacks?.onClusterToggleCollapse(id);
  };
  const onArrange = (event: MouseEvent): void => {
    event.stopPropagation();
    callbacks?.onClusterArrange(id);
  };

  return (
    <div className="rm-cluster-shell" style={colorStyle}>
      <div
        className="rm-cluster"
        data-colored={cluster.color !== undefined}
        data-selected={selected === true}
        data-collapsed={collapsed}
        data-dimmed={dimmed}
      >
        <div className="rm-cluster__label">
          <span className="rm-cluster__count">
            <span className="rm-chip-text">{cluster.count}</span>
          </span>
          <span className="rm-cluster__title">{cluster.title}</span>
          <div className="rm-cluster__actions">
            {!collapsed && callbacks?.locked !== true ? (
              <button
                type="button"
                className="rm-cluster__action nodrag"
                aria-label="Arrange nodes"
                onClick={onArrange}
              >
                <Icon name="layout-grid" />
              </button>
            ) : null}
            <button
              type="button"
              className="rm-cluster__toggle nodrag"
              aria-label={collapsed ? "Expand cluster" : "Collapse cluster"}
              onClick={onToggle}
            >
              <Icon name={collapsed ? "chevron-down" : "chevron-up"} />
            </button>
          </div>
        </div>
        {cluster.count === 0 && !collapsed ? (
          <div className="rm-cluster__placeholder">
            <span className="rm-cluster__placeholder-icon">
              <Icon name="box" />
            </span>
            <span>No nodes yet</span>
          </div>
        ) : null}
      </div>
      {showResize
        ? RESIZE_EDGES.map((position) => (
            <NodeResizeControl
              key={position}
              position={position}
              variant={position === "bottom-right" ? ResizeControlVariant.Handle : ResizeControlVariant.Line}
              minWidth={MIN_CLUSTER_WIDTH}
              minHeight={MIN_CLUSTER_HEIGHT}
              onResizeEnd={onResizeEnd}
            />
          ))
        : null}
      <NodeHandles isConnectable={isConnectable} />
    </div>
  );
}
