import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { EDGE_INTERACTION_WIDTH } from "../constants";
import { getEdgeEndpoints } from "./edgeParams";
import { ROADMAP_NODE_TYPE, type RoadmapFlowEdge, type RoadmapFlowNode, type RoadmapNodeData } from "./flow";
import { useNodeDimmed } from "./nodeFilterContext";
import { RF_EDGE_CLASS, rfEdgeUpdaterClass } from "./reactFlowInternals";

/**
 * React Flow places its invisible reconnect anchors from handle-based coordinates, so
 * for a floating end they sit away from the visible endpoint on the node perimeter.
 * The grip rendered at the real endpoint forwards the grab to the actual anchor.
 */
function forwardToReconnectAnchor(event: ReactMouseEvent<SVGCircleElement>, end: "source" | "target"): void {
  const anchor = (event.target as Element).closest(`.${RF_EDGE_CLASS}`)?.querySelector(`.${rfEdgeUpdaterClass(end)}`);

  if (anchor == null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  anchor.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      button: 0,
    }),
  );
}

const ARROW_LENGTH = 6;
const ARROW_SPREAD = 3.375;

interface Vec {
  x: number;
  y: number;
}

function inwardDirection(position: Position): Vec {
  if (position === Position.Left) {
    return { x: 1, y: 0 };
  }

  if (position === Position.Right) {
    return { x: -1, y: 0 };
  }

  if (position === Position.Top) {
    return { x: 0, y: 1 };
  }

  return { x: 0, y: -1 };
}

function arrowPath(x: number, y: number, dir: Vec): string {
  const perp = { x: -dir.y, y: dir.x };
  const bx = x - dir.x * ARROW_LENGTH;
  const by = y - dir.y * ARROW_LENGTH;

  return [
    `M ${bx + perp.x * ARROW_SPREAD} ${by + perp.y * ARROW_SPREAD}`,
    `L ${x} ${y}`,
    `L ${bx - perp.x * ARROW_SPREAD} ${by - perp.y * ARROW_SPREAD}`,
  ].join(" ");
}

/** Unit vector from one point to the other; falls back when the points coincide. */
function towards(fromX: number, fromY: number, toX: number, toY: number, fallback: Vec): Vec {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);

  return length === 0 ? fallback : { x: dx / length, y: dy / length };
}

export function FloatingEdge(props: EdgeProps<RoadmapFlowEdge>) {
  const { id, source, target, data, style } = props;
  const sourceNode = useInternalNode<RoadmapFlowNode>(source);
  const targetNode = useInternalNode<RoadmapFlowNode>(target);
  const dim = useNodeDimmed();

  if (sourceNode === undefined || targetNode === undefined) {
    return null;
  }

  /* An edge is dimmed with the filter when a node endpoint is filtered out; cluster
     endpoints carry no status/priority, so they never dim the edge. */
  const endpointDimmed = (node: InternalNode<RoadmapFlowNode>): boolean =>
    node.type === ROADMAP_NODE_TYPE &&
    dim((node.data as RoadmapNodeData).status, (node.data as RoadmapNodeData).priority);
  const dimmed = endpointDimmed(sourceNode) || endpointDimmed(targetNode);

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeEndpoints(
    sourceNode,
    targetNode,
    data?.fromSide,
    data?.toSide,
  );
  const shape = data?.shape;
  const [path, labelX, labelY] =
    shape === "straight"
      ? getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty })
      : shape === "step"
        ? getSmoothStepPath({
            sourceX: sx,
            sourceY: sy,
            sourcePosition: sourcePos,
            targetX: tx,
            targetY: ty,
            targetPosition: targetPos,
          })
        : getBezierPath({
            sourceX: sx,
            sourceY: sy,
            sourcePosition: sourcePos,
            targetX: tx,
            targetY: ty,
            targetPosition: targetPos,
          });
  /* Bezier and step paths enter a node perpendicular to its side; a straight segment
     arrives at an arbitrary angle, so its arrows follow the segment instead. */
  const targetArrowDir =
    shape === "straight" ? towards(sx, sy, tx, ty, inwardDirection(targetPos)) : inwardDirection(targetPos);
  const sourceArrowDir =
    shape === "straight" ? towards(tx, ty, sx, sy, inwardDirection(sourcePos)) : inwardDirection(sourcePos);
  const direction = data?.direction ?? "forward";
  const line = data?.line;
  const label = data?.label;
  const color = data?.color;
  /* Retargets the edge tokens so the line and arrows inherit the custom color; the
     selected/updating rules set stroke directly and still win, keeping those affordances. */
  const colorVars: CSSProperties | undefined =
    color === undefined ? undefined : ({ "--rm-edge-color": color, "--rm-edge-hover": color } as CSSProperties);
  const edgeStyle: CSSProperties =
    line === "dotted"
      ? {
          ...style,
          strokeDasharray: "var(--rm-edge-dot)",
          strokeLinecap: "round",
          strokeWidth: "var(--rm-edge-dot-size)",
        }
      : line === "dashed"
        ? { ...style, strokeDasharray: "var(--rm-edge-dash)" }
        : (style ?? {});

  return (
    <g style={colorVars} className={dimmed ? "rm-edge-dimmed" : undefined}>
      <BaseEdge id={id} path={path} style={edgeStyle} interactionWidth={EDGE_INTERACTION_WIDTH} />
      {direction === "forward" || direction === "both" ? (
        <path className="rm-edge-arrow" d={arrowPath(tx, ty, targetArrowDir)} />
      ) : null}
      {direction === "both" ? <path className="rm-edge-arrow" d={arrowPath(sx, sy, sourceArrowDir)} /> : null}
      {data?.fromSide === undefined ? (
        <>
          <circle className="rm-edge-grip-dot" cx={sx} cy={sy} />
          <circle
            className="rm-edge-grip"
            cx={sx}
            cy={sy}
            r={EDGE_INTERACTION_WIDTH / 2}
            onMouseDown={(event) => forwardToReconnectAnchor(event, "source")}
          />
        </>
      ) : null}
      {data?.toSide === undefined ? (
        <>
          <circle className="rm-edge-grip-dot" cx={tx} cy={ty} />
          <circle
            className="rm-edge-grip"
            cx={tx}
            cy={ty}
            r={EDGE_INTERACTION_WIDTH / 2}
            onMouseDown={(event) => forwardToReconnectAnchor(event, "target")}
          />
        </>
      ) : null}
      {label !== undefined && label.length > 0 ? (
        <EdgeLabelRenderer>
          <div
            className="rm-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
}
