"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EyeOff } from "lucide-react";
import { buildAnimationStyle } from "@/lib/animations";
import { ensureCustomFontLoaded, resolveFontFamilyCss } from "@/lib/fonts";
import { buildBrushStrokeData } from "@/lib/geometry";
import type { BoardElement } from "@/types/board";
import { VideoElementNode } from "./VideoElementNode";

interface StageElementProps {
  element: BoardElement;
  mode: "editor" | "obs" | "thumbnail";
  isEditingText?: boolean;
  onTextChange?: (nextText: string) => void;
  onTextResize?: (nextHeight: number) => void;
  onTextBlur?: () => void;
  onVideoAutoHide?: (elementId: string) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

function getStrokeDashArray(
  style: BoardElement["strokeStyle"],
  width: number
): string | undefined {
  if (style === "dashed") {
    return `${Math.max(8, width * 3)} ${Math.max(6, width * 2)}`;
  }
  if (style === "dotted") {
    return `${width} ${width * 2}`;
  }
  return undefined;
}

const StageElementInner: React.FC<StageElementProps> = ({
  element,
  mode,
  isEditingText = false,
  onTextChange,
  onTextResize,
  onTextBlur,
  onVideoAutoHide,
  onPointerDown,
  onDoubleClick,
}) => {
  const prevVisibleRef = useRef(element.visible);
  const [exitingInObs, setExitingInObs] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load custom uploaded font if needed
  useEffect(() => {
    if (element.type === "text" && element.customFontName && element.customFontUrl) {
      void ensureCustomFontLoaded(element.customFontName, element.customFontUrl);
    }
  }, [element.type, element.customFontName, element.customFontUrl]);

  // Handle OBS exit animation when element transitions visible: true -> false
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = element.visible;

    if (mode !== "obs") {
      setExitingInObs(false);
      return;
    }

    if (wasVisible && !element.visible) {
      const exitAnim = element.animation?.exit;
      if (exitAnim && exitAnim !== "none") {
        setExitingInObs(true);
        const dur = Math.max(120, element.animation?.exitDurationMs ?? 320);
        const timer = setTimeout(() => setExitingInObs(false), dur + 20);
        return () => clearTimeout(timer);
      }
      setExitingInObs(false);
    } else if (element.visible) {
      setExitingInObs(false);
    }
  }, [element.visible, element.animation?.exit, element.animation?.exitDurationMs, mode]);

  // Auto-focus & select text when entering edit mode
  useEffect(() => {
    if (isEditingText && textareaRef.current) {
      textareaRef.current.focus();
      if (textareaRef.current.value === "Escribe aquí…") {
        textareaRef.current.select();
      }
    }
  }, [isEditingText]);

  const brushType = element.brushType ?? "pen";
  const strokeData = useMemo(() => {
    if (element.type !== "freehand" || !element.points?.length) {
      return { path: "" };
    }
    return buildBrushStrokeData(
      element.points,
      element.strokeWidth ?? 6,
      brushType,
      element.id,
      element.brushSmoothing,
      element.brushTaper
    );
  }, [
    element.type,
    element.points,
    element.strokeWidth,
    brushType,
    element.id,
    element.brushSmoothing,
    element.brushTaper,
  ]);

  // In OBS and thumbnails, hidden elements are completely invisible after any exit animation
  if (!element.visible && mode !== "editor" && !exitingInObs) {
    return null;
  }

  const strokeColor = element.strokeColor ?? "#ffffff";
  const fillColor = element.fillColor ?? "transparent";
  const strokeWidth = element.strokeWidth ?? 4;
  const dashArray = getStrokeDashArray(element.strokeStyle, strokeWidth);

  const isGhostHidden = mode === "editor" && !element.visible;
  const effectiveOpacity = isGhostHidden
    ? Math.max(0.14, (element.opacity ?? 1) * 0.32)
    : (element.opacity ?? 1);

  const animPhase: "enter" | "exit" =
    mode === "obs" && exitingInObs ? "exit" : "enter";
  const animStyle =
    mode === "thumbnail"
      ? {}
      : buildAnimationStyle(element.animation, animPhase);
  const animKey = `${element.animation?.triggerKey ?? 0}-${
    element.visible ? "v" : "h"
  }-${animPhase}`;

  // Use accurate hit-testing: vector strokes and hollow shapes delegate clicks to SVG geometry
  const isHollowShape =
    (element.type === "rectangle" || element.type === "ellipse") &&
    (!fillColor || fillColor === "transparent");
  const isVectorHit =
    element.type === "freehand" ||
    element.type === "line" ||
    element.type === "arrow" ||
    isHollowShape;

  const canInteractInEditor = mode === "editor" && !element.locked;
  const wrapperPointerEvents: React.CSSProperties["pointerEvents"] =
    !canInteractInEditor
      ? "none"
      : isEditingText || !isVectorHit
        ? "auto"
        : "none";

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: Math.max(1, element.width),
    height: Math.max(1, element.height),
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    transformOrigin: "center center",
    opacity: effectiveOpacity,
    zIndex: element.zIndex,
    pointerEvents: wrapperPointerEvents,
    userSelect: isEditingText ? "text" : "none",
  };

  const fontCss = resolveFontFamilyCss(
    element.fontFamily,
    element.customFontName
  );

  const activeDocPage =
    element.type === "document" && element.documentPages?.length
      ? element.documentPages[
          Math.max(
            0,
            Math.min(
              element.documentPages.length - 1,
              (element.currentPage ?? 1) - 1
            )
          )
        ]
      : null;

  return (
    <div
      style={wrapperStyle}
      onPointerDown={
        canInteractInEditor && !isVectorHit ? onPointerDown : undefined
      }
      onDoubleClick={
        canInteractInEditor && !isVectorHit ? onDoubleClick : undefined
      }
      data-element-id={element.id}
    >
      {/* Ghost visibility indicator (Editor ONLY) */}
      {isGhostHidden && (
        <div
          className="pointer-events-none absolute inset-0 rounded-lg border border-dashed border-sky-400/50 bg-sky-500/[0.04]"
          style={{ zIndex: 2 }}
        >
          <span className="absolute -top-5 left-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-studio-900/95 border border-sky-500/40 text-[9px] font-medium text-sky-300 whitespace-nowrap shadow">
            <EyeOff className="w-2.5 h-2.5" />
            Oculto en OBS
          </span>
        </div>
      )}

      {/* Animated interior wrapper (kept separate from rotation transform) */}
      <div
        key={animKey}
        className="w-full h-full relative"
        style={{
          ...animStyle,
          pointerEvents: wrapperPointerEvents,
        }}
      >
        {element.type === "freehand" && (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(1, element.viewBoxWidth ?? element.width)} ${Math.max(1, element.viewBoxHeight ?? element.height)}`}
            preserveAspectRatio="none"
            style={{
              overflow: "visible",
              display: "block",
              pointerEvents: "none",
              filter:
                brushType === "neon"
                  ? `drop-shadow(0 0 6px ${strokeColor}) drop-shadow(0 0 16px ${strokeColor})`
                  : undefined,
            }}
          >
            {brushType === "chalk" && (
              <defs>
                <filter id={`chalk-${element.id}`}>
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.9"
                    numOctaves="2"
                    result="noise"
                  />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="noise"
                    scale={Math.max(2, strokeWidth * 0.45)}
                    xChannelSelector="R"
                    yChannelSelector="G"
                  />
                </filter>
              </defs>
            )}

            {/* Generous invisible hit path for reliable clicking/dragging */}
            {canInteractInEditor && (strokeData.path || strokeData.centerlinePath) && (
              <path
                d={strokeData.centerlinePath || strokeData.path}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(18, strokeWidth * 2.2)}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: "stroke", cursor: "move" }}
                onPointerDown={onPointerDown}
                onDoubleClick={onDoubleClick}
              />
            )}

            {brushType === "dashed-ink" && strokeData.centerlinePath ? (
              <path
                d={strokeData.centerlinePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${Math.max(10, strokeWidth * 2.4)} ${Math.max(8, strokeWidth * 1.8)}`}
                style={{ pointerEvents: canInteractInEditor ? "stroke" : "none" }}
                onPointerDown={canInteractInEditor ? onPointerDown : undefined}
              />
            ) : brushType === "spray" && strokeData.sprayDots ? (
              <g
                style={{ pointerEvents: canInteractInEditor ? "visiblePainted" : "none" }}
                onPointerDown={canInteractInEditor ? onPointerDown : undefined}
              >
                {strokeData.sprayDots.map((dot, idx) => (
                  <circle
                    key={idx}
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.r}
                    fill={strokeColor}
                    opacity={dot.o}
                  />
                ))}
              </g>
            ) : (
              <>
                <path
                  d={strokeData.path}
                  fill={strokeColor}
                  fillOpacity={brushType === "highlighter" ? 0.42 : brushType === "chalk" ? 0.88 : 1}
                  filter={brushType === "chalk" ? `url(#chalk-${element.id})` : undefined}
                  style={{ pointerEvents: canInteractInEditor ? "visiblePainted" : "none" }}
                  onPointerDown={canInteractInEditor ? onPointerDown : undefined}
                />
                {brushType === "neon" && strokeData.corePath && (
                  <path
                    d={strokeData.corePath}
                    fill="#ffffff"
                    fillOpacity={0.85}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </>
            )}
          </svg>
        )}

        {element.type === "rectangle" && (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`}
            style={{
              overflow: "visible",
              display: "block",
              pointerEvents: isHollowShape ? "none" : "auto",
            }}
          >
            {canInteractInEditor && isHollowShape && (
              <rect
                x={strokeWidth / 2}
                y={strokeWidth / 2}
                width={Math.max(1, element.width - strokeWidth)}
                height={Math.max(1, element.height - strokeWidth)}
                rx={element.borderRadius ?? 12}
                ry={element.borderRadius ?? 12}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(16, strokeWidth + 12)}
                style={{ pointerEvents: "stroke", cursor: "move" }}
                onPointerDown={onPointerDown}
                onDoubleClick={onDoubleClick}
              />
            )}
            <rect
              x={strokeWidth / 2}
              y={strokeWidth / 2}
              width={Math.max(1, element.width - strokeWidth)}
              height={Math.max(1, element.height - strokeWidth)}
              rx={element.borderRadius ?? 12}
              ry={element.borderRadius ?? 12}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              style={{
                pointerEvents: canInteractInEditor
                  ? isHollowShape
                    ? "stroke"
                    : "visiblePainted"
                  : "none",
              }}
              onPointerDown={canInteractInEditor && isHollowShape ? onPointerDown : undefined}
            />
          </svg>
        )}

        {element.type === "ellipse" && (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`}
            style={{
              overflow: "visible",
              display: "block",
              pointerEvents: isHollowShape ? "none" : "auto",
            }}
          >
            {canInteractInEditor && isHollowShape && (
              <ellipse
                cx={element.width / 2}
                cy={element.height / 2}
                rx={Math.max(1, (element.width - strokeWidth) / 2)}
                ry={Math.max(1, (element.height - strokeWidth) / 2)}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(16, strokeWidth + 12)}
                style={{ pointerEvents: "stroke", cursor: "move" }}
                onPointerDown={onPointerDown}
                onDoubleClick={onDoubleClick}
              />
            )}
            <ellipse
              cx={element.width / 2}
              cy={element.height / 2}
              rx={Math.max(1, (element.width - strokeWidth) / 2)}
              ry={Math.max(1, (element.height - strokeWidth) / 2)}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              style={{
                pointerEvents: canInteractInEditor
                  ? isHollowShape
                    ? "stroke"
                    : "visiblePainted"
                  : "none",
              }}
              onPointerDown={canInteractInEditor && isHollowShape ? onPointerDown : undefined}
            />
          </svg>
        )}

        {(element.type === "line" || element.type === "arrow") &&
          (() => {
            const x1 = element.x1 ?? 0;
            const y1 = element.y1 ?? 0;
            const x2 = element.x2 ?? element.width;
            const y2 = element.y2 ?? element.height;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = Math.max(14, strokeWidth * 3.8);
            const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
            const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
            const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
            const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);

            return (
              <svg
                width="100%"
                height="100%"
                style={{
                  overflow: "visible",
                  display: "block",
                  pointerEvents: "none",
                }}
              >
                {canInteractInEditor && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={Math.max(18, strokeWidth + 14)}
                    strokeLinecap="round"
                    style={{ pointerEvents: "stroke", cursor: "move" }}
                    onPointerDown={onPointerDown}
                    onDoubleClick={onDoubleClick}
                  />
                )}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={dashArray}
                  style={{ pointerEvents: canInteractInEditor ? "stroke" : "none" }}
                  onPointerDown={canInteractInEditor ? onPointerDown : undefined}
                />
                {element.type === "arrow" && (
                  <polyline
                    points={`${ax1},${ay1} ${x2},${y2} ${ax2},${ay2}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: canInteractInEditor ? "stroke" : "none" }}
                    onPointerDown={canInteractInEditor ? onPointerDown : undefined}
                  />
                )}
              </svg>
            );
          })()}

        {element.type === "text" && (
          <div
            className="h-full w-full"
            style={{
              fontFamily: fontCss,
              color: element.textColor ?? "#ffffff",
              backgroundColor:
                element.textBgColor && element.textBgColor !== "transparent"
                  ? element.textBgColor
                  : "transparent",
              borderRadius:
                element.textBgColor && element.textBgColor !== "transparent"
                  ? (element.textBorderRadius ?? 12)
                  : 0,
              padding:
                element.textBgColor && element.textBgColor !== "transparent"
                  ? "10px 16px"
                  : "4px 6px",
              fontSize: element.fontSize ?? 36,
              fontWeight: element.fontWeight ?? "bold",
              fontStyle: element.fontStyle ?? "normal",
              textDecoration: element.textDecoration ?? "none",
              textAlign: element.textAlign ?? "left",
              lineHeight: element.lineHeight ?? 1.2,
              letterSpacing:
                element.letterSpacing !== undefined
                  ? `${element.letterSpacing}px`
                  : undefined,
              WebkitTextStroke:
                element.textStrokeWidth && element.textStrokeWidth > 0
                  ? `${element.textStrokeWidth}px ${element.textStrokeColor ?? "#000000"}`
                  : undefined,
              textShadow: element.textShadow
                ? "0 3px 12px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)"
                : undefined,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "flex",
              alignItems: "flex-start",
              overflow: "visible",
            }}
          >
            {isEditingText && mode === "editor" ? (
              <textarea
                ref={textareaRef}
                value={element.text ?? ""}
                onChange={(e) => {
                  onTextChange?.(e.target.value);
                  if (
                    onTextResize &&
                    e.currentTarget.scrollHeight > element.height
                  ) {
                    onTextResize(Math.ceil(e.currentTarget.scrollHeight + 12));
                  }
                }}
                onBlur={onTextBlur}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    onTextBlur?.();
                  }
                }}
                className="h-full w-full resize-none bg-transparent outline-none"
                style={{
                  color: "inherit",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  fontWeight: "inherit",
                  fontStyle: "inherit",
                  textDecoration: "inherit",
                  textAlign: "inherit",
                  lineHeight: "inherit",
                  letterSpacing: "inherit",
                  textShadow: "inherit",
                  WebkitTextStroke: "inherit",
                }}
              />
            ) : (
              <div className="w-full">
                {element.text || (mode === "editor" ? "Doble clic para escribir" : "")}
              </div>
            )}
          </div>
        )}

        {element.type === "image" && element.src && (
          <img
            src={element.src}
            alt={element.name}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: element.objectFit ?? "contain",
              display: "block",
              pointerEvents: "none",
            }}
          />
        )}

        {element.type === "document" && activeDocPage && (
          <div className="w-full h-full relative rounded-lg overflow-hidden shadow-2xl border border-white/10 bg-white">
            <img
              src={activeDocPage.url}
              alt={`${element.documentTitle ?? element.name} - Página ${activeDocPage.pageNumber}`}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: element.objectFit ?? "contain",
                display: "block",
                pointerEvents: "none",
              }}
            />
            {mode === "editor" &&
              element.documentPages &&
              element.documentPages.length > 1 && (
                <div className="pointer-events-none absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-studio-950/90 border border-white/15 text-[10px] font-mono tabular-nums text-sky-300 shadow">
                  Pág. {activeDocPage.pageNumber}/{element.documentPages.length}
                </div>
              )}
          </div>
        )}

        {element.type === "video" && element.src && (
          <VideoElementNode
            element={element}
            mode={mode}
            onAutoHide={onVideoAutoHide}
          />
        )}
      </div>
    </div>
  );
};

export const StageElement = React.memo(StageElementInner);
