import getStroke from "perfect-freehand";
import type { BoardElement, StrokePoint } from "@/types/board";

/**
 * Converts perfect-freehand polygon points into a smooth SVG path string.
 */
export function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"] as (string | number)[]
  );

  d.push("Z");
  return d.join(" ");
}

export function buildFreehandPath(
  points: StrokePoint[],
  strokeWidth = 6
): string {
  if (!points || points.length === 0) return "";
  const input = points.map((pt) => [pt.x, pt.y, pt.p ?? 0.5]);
  const outline = getStroke(input, {
    size: Math.max(2, strokeWidth * 1.45),
    thinning: 0.45,
    smoothing: 0.55,
    streamline: 0.5,
    easing: (t) => t,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  });
  return getSvgPathFromStroke(outline);
}

/**
 * Normalizes raw world-space stroke points into a tight bounding box (x, y, width, height)
 * with points stored relative to (x, y).
 */
export function normalizeStrokePoints(
  rawPoints: StrokePoint[],
  padding = 8
): {
  x: number;
  y: number;
  width: number;
  height: number;
  points: StrokePoint[];
} {
  if (rawPoints.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1, points: [] };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of rawPoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  const x = minX - padding;
  const y = minY - padding;
  const width = Math.max(padding * 2 + 4, maxX - minX + padding * 2);
  const height = Math.max(padding * 2 + 4, maxY - minY + padding * 2);

  const points = rawPoints.map((pt) => ({
    x: Number((pt.x - x).toFixed(2)),
    y: Number((pt.y - y).toFixed(2)),
    p: pt.p,
  }));

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
    points,
  };
}

export function getNextZIndex(elements: BoardElement[]): number {
  if (elements.length === 0) return 1;
  return Math.max(...elements.map((e) => e.zIndex)) + 1;
}

export function getElementDefaultName(type: BoardElement["type"]): string {
  switch (type) {
    case "freehand":
      return "Trazo libre";
    case "rectangle":
      return "Rectángulo";
    case "ellipse":
      return "Elipse";
    case "line":
      return "Línea";
    case "arrow":
      return "Flecha";
    case "text":
      return "Texto";
    case "image":
      return "Imagen";
    case "video":
      return "Video / Clip";
  }
}

export const PRESET_COLORS = [
  "#ffffff",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#111827",
];

export const AVATAR_COLORS = [
  "#6366f1",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#8b5cf6",
  "#f43f5e",
  "#14b8a6",
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
