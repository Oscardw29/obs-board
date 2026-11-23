"use client";

import React, { useMemo } from "react";
import { buildFreehandPath } from "@/lib/geometry";
import type { BoardElement } from "@/types/board";
import { VideoElementNode } from "./VideoElementNode";

interface StageElementProps {
  element: BoardElement;
  mode: "editor" | "obs" | "thumbnail";
  isEditingText?: boolean;
  onTextChange?: (nextText: string) => void;
  onTextBlur?: () => void;
  onVideoAutoHide?: (elementId: string) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

function getStrokeDashArray(
  style: BoardElement["strokeStyle"],
  width: number
): string | undefined {
  if (style === "dashed") return `${Math.max(8, width * 3)} ${Math.max(6, width * 2)}`;
  if (style === "dotted") return `${width} ${width * 2}`;
  return undefined;
}

export const StageElement: React.FC<StageElementProps> = ({
  element,
  mode,
  isEditingText = false,
  onTextChange,
  onTextBlur,
  onVideoAutoHide,
  onPointerDown,
  onDoubleClick,
}) => {
  const freehandPath = useMemo(() => {
    if (element.type !== "freehand" || !element.points?.length) return "";
    return buildFreehandPath(element.points, element.strokeWidth ?? 6);
  }, [element.type, element.points, element.strokeWidth]);

  if (!element.visible) return null;

  const strokeColor = element.strokeColor ?? "#ffffff";
  const fillColor = element.fillColor ?? "transparent";
  const strokeWidth = element.strokeWidth ?? 4;
  const dashArray = getStrokeDashArray(element.strokeStyle, strokeWidth);

  const fontClass =
    element.fontFamily === "hand"
      ? "font-hand"
      : element.fontFamily === "mono"
        ? "font-mono"
        : "font-sans";

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: Math.max(1, element.width),
    height: Math.max(1, element.height),
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    transformOrigin: "center center",
    opacity: element.opacity ?? 1,
    zIndex: element.zIndex,
    pointerEvents: mode === "editor" && !element.locked ? "auto" : "none",
    userSelect: isEditingText ? "text" : "none",
  };

  return (
    <div
      style={wrapperStyle}
      onPointerDown={mode === "editor" ? onPointerDown : undefined}
      onDoubleClick={mode === "editor" ? onDoubleClick : undefined}
      data-element-id={element.id}
    >
      {element.type === "freehand" && (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(1, element.viewBoxWidth ?? element.width)} ${Math.max(1, element.viewBoxHeight ?? element.height)}`}
          preserveAspectRatio="none"
          style={{ overflow: "visible", display: "block" }}
        >
          <path d={freehandPath} fill={strokeColor} />
        </svg>
      )}

      {element.type === "rectangle" && (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`}
          style={{ overflow: "visible", display: "block" }}
        >
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
          />
        </svg>
      )}

      {element.type === "ellipse" && (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`}
          style={{ overflow: "visible", display: "block" }}
        >
          <ellipse
            cx={element.width / 2}
            cy={element.height / 2}
            rx={Math.max(1, (element.width - strokeWidth) / 2)}
            ry={Math.max(1, (element.height - strokeWidth) / 2)}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
        </svg>
      )}

      {(element.type === "line" || element.type === "arrow") && (() => {
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
            style={{ overflow: "visible", display: "block" }}
          >
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={dashArray}
            />
            {element.type === "arrow" && (
              <polyline
                points={`${ax1},${ay1} ${x2},${y2} ${ax2},${ay2}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        );
      })()}

      {element.type === "text" && (
        <div
          className={`h-full w-full ${fontClass}`}
          style={{
            color: element.textColor ?? "#ffffff",
            backgroundColor:
              element.textBgColor && element.textBgColor !== "transparent"
                ? element.textBgColor
                : "transparent",
            borderRadius:
              element.textBgColor && element.textBgColor !== "transparent"
                ? 12
                : 0,
            padding:
              element.textBgColor && element.textBgColor !== "transparent"
                ? "8px 14px"
                : "4px 6px",
            fontSize: element.fontSize ?? 36,
            fontWeight: element.fontWeight ?? "bold",
            textAlign: element.textAlign ?? "left",
            lineHeight: 1.2,
            textShadow: element.textShadow
              ? "0 2px 10px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)"
              : undefined,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          {isEditingText && mode === "editor" ? (
            <textarea
              autoFocus
              value={element.text ?? ""}
              onChange={(e) => onTextChange?.(e.target.value)}
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
                font: "inherit",
                textAlign: "inherit",
                lineHeight: "inherit",
                textShadow: "inherit",
              }}
            />
          ) : (
            <div className="w-full">{element.text || "Doble clic para escribir"}</div>
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

      {element.type === "video" && element.src && (
        <VideoElementNode
          element={element}
          mode={mode}
          onAutoHide={onVideoAutoHide}
        />
      )}
    </div>
  );
};
