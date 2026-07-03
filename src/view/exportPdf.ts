import { toPng } from "html-to-image";
import { PDFDocument } from "pdf-lib";

/**
 * Board snapshot export: the flow viewport element is re-rendered at a fixed
 * transform that frames every visible node, rasterized to PNG and wrapped into a
 * single-page PDF sized to the image. Bitmap dimensions are capped because canvas
 * rasterization fails silently past engine limits on very large boards.
 */

export const EXPORT_PADDING = 48;

export const EXPORT_MAX_SIDE = 4096;

export const EXPORT_PIXEL_RATIO = 2;

export interface ExportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportNodeFrame {
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  hidden?: boolean;
}

interface ExportLayout {
  width: number;
  height: number;
  transform: string;
}

function frameSize(node: ExportNodeFrame): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  };
}

/** Bounding box of visible nodes in absolute flow coordinates. Child nodes are stored
 * relative to their cluster, so the parent offset is applied before measuring. */
export function visibleBounds(nodes: ExportNodeFrame[]): ExportRect | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    if (node.hidden === true) {
      continue;
    }

    const parent = node.parentId === undefined ? undefined : byId.get(node.parentId);
    const x = (parent?.position.x ?? 0) + node.position.x;
    const y = (parent?.position.y ?? 0) + node.position.y;
    const { width, height } = frameSize(node);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  if (minX === Infinity) {
    return null;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Image size and viewport transform framing the given bounds at 1:1, downscaled
 * uniformly when either padded side would exceed the bitmap cap. */
export function exportLayout(bounds: ExportRect, padding = EXPORT_PADDING, maxSide = EXPORT_MAX_SIDE): ExportLayout {
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  const scale = Math.min(1, maxSide / width, maxSide / height);
  const tx = (padding - bounds.x) * scale;
  const ty = (padding - bounds.y) * scale;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
  };
}

export async function wrapPngInPdf(png: string | Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png);
  const page = doc.addPage([width, height]);

  page.drawImage(image, { x: 0, y: 0, width, height });

  return doc.save();
}

/** Renders the flow viewport into a one-page PDF; null when nothing is visible. */
export async function exportBoardPdf(
  viewport: HTMLElement,
  nodes: ExportNodeFrame[],
  backgroundColor: string,
): Promise<Uint8Array | null> {
  const bounds = visibleBounds(nodes);

  if (bounds === null) {
    return null;
  }

  const { width, height, transform } = exportLayout(bounds);
  const png = await toPng(viewport, {
    backgroundColor,
    width,
    height,
    pixelRatio: EXPORT_PIXEL_RATIO,
    style: { width: `${width}px`, height: `${height}px`, transform },
  });

  return wrapPngInPdf(png, width, height);
}
