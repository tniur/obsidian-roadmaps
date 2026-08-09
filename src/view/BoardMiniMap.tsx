import { Panel, useReactFlow, useStore } from "@xyflow/react";
import { useCallback, useId, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { absoluteNodePosition, isCardNode, nodeSize, type RoadmapFlowNode } from "./flow";
import { boardFrame, clampToBounds, contentBounds, viewportRect } from "./miniMapGeometry";

/** Corner radius in board units, so the map scales it down with everything else. */
const NODE_RADIUS = 8;

function fillStyle(color: string | undefined): CSSProperties | undefined {
  return color === undefined ? undefined : ({ "--rm-minimap-fill": color } as CSSProperties);
}

interface BoardMiniMapProps {
  nodes: readonly RoadmapFlowNode[];
}

/** Board overview; pointer down or drag centres the camera on the spot, an empty board renders nothing. */
export function BoardMiniMap({ nodes }: BoardMiniMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const { setCenter, getZoom } = useReactFlow();
  const transform = useStore((state) => state.transform);
  const flowWidth = useStore((state) => state.width);
  const flowHeight = useStore((state) => state.height);

  const bounds = useMemo(() => contentBounds(nodes), [nodes]);

  const rects = useMemo(
    () =>
      nodes
        .filter((node) => node.hidden !== true)
        .map((node) => ({
          id: node.id,
          card: isCardNode(node),
          color: node.data.color,
          ...absoluteNodePosition(node, nodes),
          ...nodeSize(node),
        })),
    [nodes],
  );

  const centreOn = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const matrix = svgRef.current?.getScreenCTM() ?? null;

      if (matrix === null) {
        return;
      }

      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());

      void setCenter(point.x, point.y, { zoom: getZoom() });
    },
    [setCenter, getZoom],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      centreOn(event);
    },
    [centreOn],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        centreOn(event);
      }
    },
    [centreOn],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  if (bounds === null) {
    return null;
  }

  const camera = viewportRect(transform, flowWidth, flowHeight);
  const frame = boardFrame(bounds, camera);
  const view = clampToBounds(camera, frame);

  return (
    <Panel position="bottom-left" className="rm-panel rm-minimap nopan nodrag">
      <svg
        ref={svgRef}
        className="rm-minimap__frame"
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Board mini-map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect className="rm-minimap__view" x={view.x} y={view.y} width={view.width} height={view.height} />
          {rects.map((rect) => (
            <rect
              key={rect.id}
              className={rect.card ? "rm-minimap__node" : "rm-minimap__cluster"}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={NODE_RADIUS}
              style={fillStyle(rect.color)}
            />
          ))}
        </g>
      </svg>
    </Panel>
  );
}
