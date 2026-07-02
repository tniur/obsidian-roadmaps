import {
  Handle,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import type { CSSProperties, MouseEvent } from "react";
import { MIN_CLUSTER_HEIGHT, MIN_CLUSTER_WIDTH } from "../constants";
import type { RoadmapClusterNode } from "./flow";
import { Icon } from "./Icon";
import { useNodeCallbacks } from "./nodeCallbacks";

/** Resize handles confined to the right/bottom edges keep the cluster origin fixed, so member
 * nodes (positioned relative to it) stay put while the container grows. */
const RESIZE_EDGES = ["right", "bottom", "bottom-right"] as const;

const HANDLE_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function ClusterNodeView({ id, data, selected }: NodeProps<RoadmapClusterNode>) {
  const cluster = data;
  const callbacks = useNodeCallbacks();
  const collapsed = cluster.collapsed;
  const colorStyle =
    cluster.color !== undefined ? ({ "--rm-cluster-color": cluster.color } as CSSProperties) : undefined;
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
    <>
      <div
        className="rm-cluster"
        data-colored={cluster.color !== undefined}
        data-selected={selected === true}
        data-collapsed={collapsed}
        style={colorStyle}
      >
        <div className="rm-cluster__label">
          <button
            type="button"
            className="rm-cluster__toggle nodrag"
            aria-label={collapsed ? "Expand cluster" : "Collapse cluster"}
            onClick={onToggle}
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-down"} />
          </button>
          <span className="rm-cluster__title">{cluster.label}</span>
          {!collapsed ? (
            <button type="button" className="rm-cluster__action nodrag" aria-label="Arrange nodes" onClick={onArrange}>
              <Icon name="layout-grid" />
            </button>
          ) : null}
        </div>
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
      {HANDLE_SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className="rm-handle" />
      ))}
    </>
  );
}
