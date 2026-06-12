import { useStore } from "@xyflow/react";
import { useEffect, useRef } from "react";

interface HelperLinesProps {
  horizontal?: number;
  vertical?: number;
}

export function HelperLines({ horizontal, vertical }: HelperLinesProps) {
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
  }, [width, height, offsetX, offsetY, zoom, horizontal, vertical]);

  return <canvas ref={ref} className="rm-helper-lines" />;
}
