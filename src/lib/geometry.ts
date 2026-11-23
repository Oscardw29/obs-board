import getStroke from "perfect-freehand";
import type { BoardElement, BrushType, StrokePoint } from "@/types/board";

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

/**
 * Deterministic PRNG (Mulberry32) so spray brushes look identical across clients & OBS.
 */
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BrushStrokeRenderData {
  path: string;
  corePath?: string;
  centerlinePath?: string;
  sprayDots?: Array<{ x: number; y: number; r: number; o: number }>;
}

function buildCenterlinePath(points: StrokePoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
  }
  const cmds: string[] = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    cmds.push(
      `Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
    );
  }
  const last = points[points.length - 1];
  cmds.push(`L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
  return cmds.join(" ");
}

export function buildFreehandPath(
  points: StrokePoint[],
  strokeWidth = 6,
  brushType: BrushType = "pen",
  smoothingOverride?: number,
  taperOverride?: number
): string {
  if (!points || points.length === 0) return "";

  let input: number[][];
  let size = Math.max(2, strokeWidth * 1.45);
  let thinning = 0.45;
  let smoothing = smoothingOverride ?? 0.55;
  let streamline = 0.5;
  let simulatePressure = true;
  let taperStart = taperOverride ?? 0;
  let taperEnd = taperOverride ?? 0;

  if (brushType === "calligraphy") {
    size = Math.max(3, strokeWidth * 1.9);
    thinning = 0.85;
    smoothing = smoothingOverride ?? 0.6;
    streamline = 0.55;
    simulatePressure = false;
    taperStart = taperOverride ?? 8;
    taperEnd = taperOverride ?? 10;

    input = points.map((pt, idx) => {
      const prev = points[Math.max(0, idx - 1)];
      const next = points[Math.min(points.length - 1, idx + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const angle = Math.atan2(dy, dx);
      // 45-degree nib modulation
      const nibFactor = 0.22 + 0.78 * Math.abs(Math.sin(angle - Math.PI / 4));
      return [pt.x, pt.y, Math.min(1, Math.max(0.15, nibFactor))];
    });
  } else {
    input = points.map((pt) => [pt.x, pt.y, pt.p ?? 0.5]);

    switch (brushType) {
      case "marker":
        size = Math.max(4, strokeWidth * 1.65);
        thinning = 0.12;
        smoothing = smoothingOverride ?? 0.7;
        streamline = 0.65;
        break;
      case "highlighter":
        size = Math.max(10, strokeWidth * 2.8);
        thinning = 0.04;
        smoothing = smoothingOverride ?? 0.75;
        streamline = 0.7;
        break;
      case "neon":
        size = Math.max(3, strokeWidth * 1.35);
        thinning = 0.22;
        smoothing = smoothingOverride ?? 0.7;
        streamline = 0.62;
        break;
      case "chalk":
        size = Math.max(4, strokeWidth * 1.75);
        thinning = 0.35;
        smoothing = smoothingOverride ?? 0.28;
        streamline = 0.3;
        break;
      case "pen":
      default:
        break;
    }
  }

  const outline = getStroke(input, {
    size,
    thinning,
    smoothing,
    streamline,
    simulatePressure,
    easing: (t) => t,
    start: { taper: taperStart, cap: true },
    end: { taper: taperEnd, cap: true },
  });

  return getSvgPathFromStroke(outline);
}

export function buildBrushStrokeData(
  points: StrokePoint[],
  strokeWidth = 6,
  brushType: BrushType = "pen",
  seedId = "stroke",
  smoothing?: number,
  taper?: number
): BrushStrokeRenderData {
  if (!points || points.length === 0) return { path: "" };

  if (brushType === "dashed-ink") {
    return {
      path: "",
      centerlinePath: buildCenterlinePath(points),
    };
  }

  if (brushType === "spray") {
    const rand = mulberry32(hashSeed(seedId));
    const dots: Array<{ x: number; y: number; r: number; o: number }> = [];
    const radius = Math.max(6, strokeWidth * 1.9);
    const density = Math.min(18, Math.max(6, Math.round(strokeWidth * 1.4)));
    // Cap total dots to preserve 60fps
    const stride = points.length > 180 ? Math.ceil(points.length / 180) : 1;

    for (let i = 0; i < points.length; i += stride) {
      const pt = points[i];
      for (let j = 0; j < density; j++) {
        const angle = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * radius;
        const r = Math.max(0.8, (0.6 + rand() * 1.6) * (strokeWidth / 6));
        const o = 0.28 + rand() * 0.65;
        dots.push({
          x: Number((pt.x + Math.cos(angle) * dist).toFixed(1)),
          y: Number((pt.y + Math.sin(angle) * dist).toFixed(1)),
          r: Number(r.toFixed(2)),
          o: Number(o.toFixed(2)),
        });
      }
    }
    return {
      path: buildCenterlinePath(points),
      sprayDots: dots,
    };
  }

  const path = buildFreehandPath(points, strokeWidth, brushType, smoothing, taper);

  if (brushType === "neon") {
    const corePath = buildFreehandPath(
      points,
      Math.max(1.5, strokeWidth * 0.42),
      "pen",
      smoothing ?? 0.7,
      taper
    );
    return { path, corePath };
  }

  return { path };
}

/**
 * Normalizes raw world-space stroke points into a tight bounding box (x, y, width, height)
 * with points stored relative to (x, y).
 */
export function normalizeStrokePoints(
  rawPoints: StrokePoint[],
  padding = 10
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
    case "document":
      return "Documento";
  }
}

/**
 * Returns sequential element names: "Trazo libre", "Trazo libre 2", "Trazo libre 3", ...
 */
export function getNextElementName(
  type: BoardElement["type"],
  existingElements: BoardElement[],
  customBase?: string
): string {
  const base = (customBase ?? getElementDefaultName(type)).trim();
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numRegex = new RegExp(`^${escaped}\\s+(\\d+)$`, "i");

  let hasBase = false;
  let maxNum = 1;

  for (const el of existingElements) {
    const trimmed = el.name.trim();
    if (trimmed.toLowerCase() === base.toLowerCase()) {
      hasBase = true;
      continue;
    }
    const match = numRegex.exec(trimmed);
    if (match) {
      hasBase = true;
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  if (!hasBase) return base;
  return `${base} ${maxNum + 1}`;
}

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export function getElementWorldBounds(el: BoardElement): WorldRect {
  const w = Math.max(1, el.width);
  const h = Math.max(1, el.height);
  const cx = el.x + w / 2;
  const cy = el.y + h / 2;
  const rot = ((el.rotation ?? 0) * Math.PI) / 180;

  if (Math.abs(rot) < 0.0001) {
    return {
      left: el.x,
      top: el.y,
      right: el.x + w,
      bottom: el.y + h,
      width: w,
      height: h,
      cx,
      cy,
    };
  }

  const cos = Math.abs(Math.cos(rot));
  const sin = Math.abs(Math.sin(rot));
  const bbW = w * cos + h * sin;
  const bbH = w * sin + h * cos;

  return {
    left: cx - bbW / 2,
    top: cy - bbH / 2,
    right: cx + bbW / 2,
    bottom: cy + bbH / 2,
    width: bbW,
    height: bbH,
    cx,
    cy,
  };
}

export function getGroupBounds(elements: BoardElement[]): WorldRect | null {
  if (elements.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const el of elements) {
    const b = getElementWorldBounds(el);
    if (b.left < left) left = b.left;
    if (b.top < top) top = b.top;
    if (b.right > right) right = b.right;
    if (b.bottom > bottom) bottom = b.bottom;
  }

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    cx: left + width / 2,
    cy: top + height / 2,
  };
}

export function doRectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

// ============================================================================
// ERASER GEOMETRY HELPERS
// ============================================================================

export function distPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function toElementLocalPoint(
  wx: number,
  wy: number,
  el: BoardElement
): { x: number; y: number } {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rot = (-(el.rotation ?? 0) * Math.PI) / 180;
  const dx = wx - cx;
  const dy = wy - cy;
  if (Math.abs(rot) < 0.0001) {
    return { x: wx - el.x, y: wy - el.y };
  }
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: dx * cos - dy * sin + el.width / 2,
    y: dx * sin + dy * cos + el.height / 2,
  };
}

export function doesCircleHitElement(
  cx: number,
  cy: number,
  radius: number,
  el: BoardElement
): boolean {
  const local = toElementLocalPoint(cx, cy, el);
  const strokePad = (el.strokeWidth ?? 6) * 0.6;

  if (el.type === "freehand" && el.points && el.points.length > 0) {
    const vbW = Math.max(1, el.viewBoxWidth ?? el.width);
    const vbH = Math.max(1, el.viewBoxHeight ?? el.height);
    const sx = el.width / vbW;
    const sy = el.height / vbH;
    const threshold = radius + strokePad;

    if (el.points.length === 1) {
      return (
        Math.hypot(local.x - el.points[0].x * sx, local.y - el.points[0].y * sy) <=
        threshold
      );
    }

    for (let i = 0; i < el.points.length - 1; i++) {
      const p1 = el.points[i];
      const p2 = el.points[i + 1];
      const d = distPointToSegment(
        local.x,
        local.y,
        p1.x * sx,
        p1.y * sy,
        p2.x * sx,
        p2.y * sy
      );
      if (d <= threshold) return true;
    }
    return false;
  }

  if (el.type === "line" || el.type === "arrow") {
    const x1 = el.x1 ?? 0;
    const y1 = el.y1 ?? 0;
    const x2 = el.x2 ?? el.width;
    const y2 = el.y2 ?? el.height;
    return distPointToSegment(local.x, local.y, x1, y1, x2, y2) <= radius + strokePad;
  }

  if (
    (el.type === "rectangle" || el.type === "ellipse") &&
    (!el.fillColor || el.fillColor === "transparent")
  ) {
    const threshold = radius + strokePad;
    if (el.type === "rectangle") {
      const dTop = distPointToSegment(local.x, local.y, 0, 0, el.width, 0);
      const dBottom = distPointToSegment(
        local.x,
        local.y,
        0,
        el.height,
        el.width,
        el.height
      );
      const dLeft = distPointToSegment(local.x, local.y, 0, 0, 0, el.height);
      const dRight = distPointToSegment(
        local.x,
        local.y,
        el.width,
        0,
        el.width,
        el.height
      );
      return Math.min(dTop, dBottom, dLeft, dRight) <= threshold;
    }
    // Hollow ellipse perimeter check
    const rx = Math.max(1, el.width / 2);
    const ry = Math.max(1, el.height / 2);
    const nx = (local.x - rx) / rx;
    const ny = (local.y - ry) / ry;
    const normDist = Math.hypot(nx, ny);
    const avgR = (rx + ry) / 2;
    const radialDist = Math.abs(normDist - 1) * avgR;
    return radialDist <= threshold;
  }

  // Filled shape, text, image, video, document
  const closestX = Math.max(0, Math.min(el.width, local.x));
  const closestY = Math.max(0, Math.min(el.height, local.y));
  return Math.hypot(local.x - closestX, local.y - closestY) <= radius;
}

/**
 * Splits a freehand stroke by an eraser path (world coordinates).
 * Returns null if the eraser never hit the stroke, or an array of surviving StrokePoint runs
 * in world coordinates.
 */
export function splitFreehandStrokeByEraser(
  el: BoardElement,
  eraserTrail: Array<{ x: number; y: number }>,
  eraserRadius: number
): { hit: boolean; survivingWorldRuns: StrokePoint[][] } {
  if (el.type !== "freehand" || !el.points || el.points.length < 2) {
    return { hit: false, survivingWorldRuns: [] };
  }

  const vbW = Math.max(1, el.viewBoxWidth ?? el.width);
  const vbH = Math.max(1, el.viewBoxHeight ?? el.height);
  const sx = el.width / vbW;
  const sy = el.height / vbH;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rot = ((el.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // Convert stroke points to world space and subdivide long segments (~5px)
  const worldPts: StrokePoint[] = [];
  for (let i = 0; i < el.points.length; i++) {
    const p = el.points[i];
    const lx = p.x * sx - el.width / 2;
    const ly = p.y * sy - el.height / 2;
    const wx = cx + lx * cos - ly * sin;
    const wy = cy + lx * sin + ly * cos;
    const wp: StrokePoint = { x: wx, y: wy, p: p.p };

    if (worldPts.length > 0) {
      const prev = worldPts[worldPts.length - 1];
      const dist = Math.hypot(wx - prev.x, wy - prev.y);
      if (dist > 6) {
        const steps = Math.min(30, Math.ceil(dist / 5));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          worldPts.push({
            x: prev.x + (wx - prev.x) * t,
            y: prev.y + (wy - prev.y) * t,
            p: (prev.p ?? 0.5) + ((p.p ?? 0.5) - (prev.p ?? 0.5)) * t,
          });
        }
      }
    }
    worldPts.push(wp);
  }

  const effectiveRadius = eraserRadius + (el.strokeWidth ?? 6) * 0.35;
  let hit = false;
  const survivingRuns: StrokePoint[][] = [];
  let currentRun: StrokePoint[] = [];

  for (const pt of worldPts) {
    let erased = false;
    for (let i = 0; i < eraserTrail.length; i++) {
      const e1 = eraserTrail[i];
      if (i === eraserTrail.length - 1) {
        if (Math.hypot(pt.x - e1.x, pt.y - e1.y) <= effectiveRadius) {
          erased = true;
          break;
        }
      } else {
        const e2 = eraserTrail[i + 1];
        if (distPointToSegment(pt.x, pt.y, e1.x, e1.y, e2.x, e2.y) <= effectiveRadius) {
          erased = true;
          break;
        }
      }
    }

    if (erased) {
      hit = true;
      if (currentRun.length >= 2) {
        survivingRuns.push(currentRun);
      }
      currentRun = [];
    } else {
      currentRun.push(pt);
    }
  }

  if (currentRun.length >= 2) {
    survivingRuns.push(currentRun);
  }

  return { hit, survivingWorldRuns: survivingRuns };
}

export const PRESET_COLORS = [
  "#ffffff",
  "#38bdf8",
  "#2563eb",
  "#10b981",
  "#facc15",
  "#f97316",
  "#f43f5e",
  "#e2e8f0",
  "#64748b",
  "#090b10",
];

export const AVATAR_COLORS = [
  "#38bdf8",
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#6366f1",
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
