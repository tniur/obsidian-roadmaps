import { useStore } from "@xyflow/react";
import { useEffect, useRef } from "react";
import type { BoardGuides } from "./alignment";

export function HelperLines({ horizontal, vertical, spacing }: BoardGuides) {
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const offsetX = useStore((state) => state.transform[0]);
  const offsetY = useStore((state) => state.transform[1]);
  const zoom = useStore((state) => state.transform[2]);
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");

    if (canvas === null || ctx === null || ctx === undefined) {
      return;
    }

    const dpi = window.devicePixelRatio || 1;

    canvas.width = width * dpi;
    canvas.height = height * dpi;
    ctx.scale(dpi, dpi);
    ctx.clearRect(0, 0, width, height);

    const styles = window.getComputedStyle(canvas);

    ctx.strokeStyle = styles.getPropertyValue("--rm-guide-color").trim();
    ctx.lineWidth = Number.parseFloat(styles.getPropertyValue("--rm-guide-width")) || 1;

    if (typeof vertical === "number") {
      const x = vertical * zoom + offsetX;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (typeof horizontal === "number") {
      const y = horizontal * zoom + offsetY;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const cap = Number.parseFloat(styles.getPropertyValue("--rm-guide-cap")) || 4;

    for (const guide of spacing ?? []) {
      const alongOffset = guide.axis === "x" ? offsetX : offsetY;
      const crossOffset = guide.axis === "x" ? offsetY : offsetX;
      const from = guide.from * zoom + alongOffset;
      const to = guide.to * zoom + alongOffset;
      const cross = guide.cross * zoom + crossOffset;

      ctx.beginPath();

      if (guide.axis === "x") {
        ctx.moveTo(from, cross);
        ctx.lineTo(to, cross);
        ctx.moveTo(from, cross - cap);
        ctx.lineTo(from, cross + cap);
        ctx.moveTo(to, cross - cap);
        ctx.lineTo(to, cross + cap);
      } else {
        ctx.moveTo(cross, from);
        ctx.lineTo(cross, to);
        ctx.moveTo(cross - cap, from);
        ctx.lineTo(cross + cap, from);
        ctx.moveTo(cross - cap, to);
        ctx.lineTo(cross + cap, to);
      }

      ctx.stroke();
    }
  }, [width, height, offsetX, offsetY, zoom, horizontal, vertical, spacing]);

  return <canvas ref={ref} className="rm-helper-lines" />;
}
