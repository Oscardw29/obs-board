import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardElement,
} from "@/types/board";
import { getElementWorldBounds, getGroupBounds } from "./geometry";

export interface SnapGuide {
  orientation: "v" | "h";
  pos: number;
  start: number;
  end: number;
  kind: "stage" | "center" | "element";
}

interface SnapCandidate {
  pos: number;
  spanStart: number;
  spanEnd: number;
  kind: "stage" | "center" | "element";
}

function getSnapThreshold(zoom: number): number {
  return Math.max(4, Math.min(10, 7 / Math.max(0.2, zoom)));
}

function buildCandidates(
  elements: BoardElement[],
  excludeIds: Set<string>,
  includeThirdsGuides: boolean
): { xCandidates: SnapCandidate[]; yCandidates: SnapCandidate[] } {
  const xCandidates: SnapCandidate[] = [
    { pos: 0, spanStart: 0, spanEnd: STAGE_HEIGHT, kind: "stage" },
    { pos: STAGE_WIDTH / 2, spanStart: 0, spanEnd: STAGE_HEIGHT, kind: "center" },
    { pos: STAGE_WIDTH, spanStart: 0, spanEnd: STAGE_HEIGHT, kind: "stage" },
  ];

  const yCandidates: SnapCandidate[] = [
    { pos: 0, spanStart: 0, spanEnd: STAGE_WIDTH, kind: "stage" },
    { pos: STAGE_HEIGHT / 2, spanStart: 0, spanEnd: STAGE_WIDTH, kind: "center" },
    { pos: STAGE_HEIGHT, spanStart: 0, spanEnd: STAGE_WIDTH, kind: "stage" },
  ];

  if (includeThirdsGuides) {
    xCandidates.push(
      { pos: Math.round(STAGE_WIDTH / 3), spanStart: 0, spanEnd: STAGE_HEIGHT, kind: "stage" },
      { pos: Math.round((STAGE_WIDTH * 2) / 3), spanStart: 0, spanEnd: STAGE_HEIGHT, kind: "stage" },
      { pos: Math.round(STAGE_WIDTH * 0.05), spanStart: 0, spanEnd: STAGE_HEIGHT, kind: "stage" },
      { pos: Math.round(STAGE_WIDTH * 0.95), spanStart: 0, spanEnd: STAGE_HEIGHT, kind: "stage" }
    );
    yCandidates.push(
      { pos: Math.round(STAGE_HEIGHT / 3), spanStart: 0, spanEnd: STAGE_WIDTH, kind: "stage" },
      { pos: Math.round((STAGE_HEIGHT * 2) / 3), spanStart: 0, spanEnd: STAGE_WIDTH, kind: "stage" },
      { pos: Math.round(STAGE_HEIGHT * 0.05), spanStart: 0, spanEnd: STAGE_WIDTH, kind: "stage" },
      { pos: Math.round(STAGE_HEIGHT * 0.95), spanStart: 0, spanEnd: STAGE_WIDTH, kind: "stage" }
    );
  }

  for (const el of elements) {
    if (excludeIds.has(el.id) || !el.visible) continue;
    const b = getElementWorldBounds(el);
    xCandidates.push(
      { pos: b.left, spanStart: b.top, spanEnd: b.bottom, kind: "element" },
      { pos: b.cx, spanStart: b.top, spanEnd: b.bottom, kind: "center" },
      { pos: b.right, spanStart: b.top, spanEnd: b.bottom, kind: "element" }
    );
    yCandidates.push(
      { pos: b.top, spanStart: b.left, spanEnd: b.right, kind: "element" },
      { pos: b.cy, spanStart: b.left, spanEnd: b.right, kind: "center" },
      { pos: b.bottom, spanStart: b.left, spanEnd: b.right, kind: "element" }
    );
  }

  return { xCandidates, yCandidates };
}

export function computeMoveSnap(params: {
  movingElements: BoardElement[];
  allElements: BoardElement[];
  deltaX: number;
  deltaY: number;
  zoom: number;
  includeGuides?: boolean;
}): { dx: number; dy: number; guides: SnapGuide[] } {
  const { movingElements, allElements, deltaX, deltaY, zoom, includeGuides = false } =
    params;

  const baseBounds = getGroupBounds(movingElements);
  if (!baseBounds) {
    return { dx: deltaX, dy: deltaY, guides: [] };
  }

  const threshold = getSnapThreshold(zoom);
  const excludeIds = new Set(movingElements.map((e) => e.id));
  const { xCandidates, yCandidates } = buildCandidates(
    allElements,
    excludeIds,
    includeGuides
  );

  const curLeft = baseBounds.left + deltaX;
  const curCx = baseBounds.cx + deltaX;
  const curRight = baseBounds.right + deltaX;
  const curTop = baseBounds.top + deltaY;
  const curCy = baseBounds.cy + deltaY;
  const curBottom = baseBounds.bottom + deltaY;

  let bestSnapX: { diff: number; candidate: SnapCandidate } | null = null;
  for (const cand of xCandidates) {
    for (const anchor of [curLeft, curCx, curRight]) {
      const diff = cand.pos - anchor;
      if (Math.abs(diff) <= threshold) {
        if (!bestSnapX || Math.abs(diff) < Math.abs(bestSnapX.diff)) {
          bestSnapX = { diff, candidate: cand };
        }
      }
    }
  }

  let bestSnapY: { diff: number; candidate: SnapCandidate } | null = null;
  for (const cand of yCandidates) {
    for (const anchor of [curTop, curCy, curBottom]) {
      const diff = cand.pos - anchor;
      if (Math.abs(diff) <= threshold) {
        if (!bestSnapY || Math.abs(diff) < Math.abs(bestSnapY.diff)) {
          bestSnapY = { diff, candidate: cand };
        }
      }
    }
  }

  const finalDx = bestSnapX ? deltaX + bestSnapX.diff : deltaX;
  const finalDy = bestSnapY ? deltaY + bestSnapY.diff : deltaY;

  const guides: SnapGuide[] = [];
  if (bestSnapX) {
    const shiftedTop = baseBounds.top + finalDy;
    const shiftedBottom = baseBounds.bottom + finalDy;
    guides.push({
      orientation: "v",
      pos: bestSnapX.candidate.pos,
      start: Math.min(shiftedTop, bestSnapX.candidate.spanStart) - 24,
      end: Math.max(shiftedBottom, bestSnapX.candidate.spanEnd) + 24,
      kind: bestSnapX.candidate.kind,
    });
  }
  if (bestSnapY) {
    const shiftedLeft = baseBounds.left + finalDx;
    const shiftedRight = baseBounds.right + finalDx;
    guides.push({
      orientation: "h",
      pos: bestSnapY.candidate.pos,
      start: Math.min(shiftedLeft, bestSnapY.candidate.spanStart) - 24,
      end: Math.max(shiftedRight, bestSnapY.candidate.spanEnd) + 24,
      kind: bestSnapY.candidate.kind,
    });
  }

  return { dx: finalDx, dy: finalDy, guides };
}

export function computeResizeSnap(params: {
  elementId: string;
  handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  box: { x: number; y: number; width: number; height: number };
  allElements: BoardElement[];
  zoom: number;
  keepAspect: boolean;
  includeGuides?: boolean;
}): { x: number; y: number; width: number; height: number; guides: SnapGuide[] } {
  const { elementId, handle, box, allElements, zoom, keepAspect, includeGuides = false } =
    params;

  const threshold = getSnapThreshold(zoom);
  const excludeIds = new Set([elementId]);
  const { xCandidates, yCandidates } = buildCandidates(
    allElements,
    excludeIds,
    includeGuides
  );

  let { x, y, width, height } = box;
  const guides: SnapGuide[] = [];

  // Snap horizontal edge (e or w)
  if (handle.includes("e")) {
    const right = x + width;
    let best: { diff: number; cand: SnapCandidate } | null = null;
    for (const cand of xCandidates) {
      const diff = cand.pos - right;
      if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) {
        best = { diff, cand };
      }
    }
    if (best && width + best.diff >= 20) {
      width += best.diff;
      if (keepAspect && box.width > 0) {
        const ratio = box.height / box.width;
        const nextH = Math.max(20, width * ratio);
        if (handle.includes("n")) y -= nextH - height;
        height = nextH;
      }
      guides.push({
        orientation: "v",
        pos: best.cand.pos,
        start: Math.min(y, best.cand.spanStart) - 20,
        end: Math.max(y + height, best.cand.spanEnd) + 20,
        kind: best.cand.kind,
      });
    }
  } else if (handle.includes("w")) {
    let best: { diff: number; cand: SnapCandidate } | null = null;
    for (const cand of xCandidates) {
      const diff = cand.pos - x;
      if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) {
        best = { diff, cand };
      }
    }
    if (best && width - best.diff >= 20) {
      x += best.diff;
      width -= best.diff;
      if (keepAspect && box.width > 0) {
        const ratio = box.height / box.width;
        const nextH = Math.max(20, width * ratio);
        if (handle.includes("n")) y -= nextH - height;
        height = nextH;
      }
      guides.push({
        orientation: "v",
        pos: best.cand.pos,
        start: Math.min(y, best.cand.spanStart) - 20,
        end: Math.max(y + height, best.cand.spanEnd) + 20,
        kind: best.cand.kind,
      });
    }
  }

  // Snap vertical edge (s or n) when aspect ratio wasn't already locked by X
  if (!keepAspect) {
    if (handle.includes("s")) {
      const bottom = y + height;
      let best: { diff: number; cand: SnapCandidate } | null = null;
      for (const cand of yCandidates) {
        const diff = cand.pos - bottom;
        if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) {
          best = { diff, cand };
        }
      }
      if (best && height + best.diff >= 20) {
        height += best.diff;
        guides.push({
          orientation: "h",
          pos: best.cand.pos,
          start: Math.min(x, best.cand.spanStart) - 20,
          end: Math.max(x + width, best.cand.spanEnd) + 20,
          kind: best.cand.kind,
        });
      }
    } else if (handle.includes("n")) {
      let best: { diff: number; cand: SnapCandidate } | null = null;
      for (const cand of yCandidates) {
        const diff = cand.pos - y;
        if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) {
          best = { diff, cand };
        }
      }
      if (best && height - best.diff >= 20) {
        y += best.diff;
        height -= best.diff;
        guides.push({
          orientation: "h",
          pos: best.cand.pos,
          start: Math.min(x, best.cand.spanStart) - 20,
          end: Math.max(x + width, best.cand.spanEnd) + 20,
          kind: best.cand.kind,
        });
      }
    }
  }

  return { x, y, width, height, guides };
}

export function computeRotateSnap(deg: number, snapEnabled: boolean, shiftHeld: boolean): number {
  if (shiftHeld) {
    return Math.round(deg / 15) * 15;
  }
  if (!snapEnabled) return Math.round(deg);
  const cardinal = [0, 45, 90, 135, 180, -45, -90, -135, -180, 270, 360];
  for (const angle of cardinal) {
    if (Math.abs(deg - angle) <= 4) {
      return angle;
    }
  }
  return Math.round(deg);
}
