"use client";

import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Film,
  Layers,
  Lock,
  Pause,
  Play,
  Trash2,
  Unlock,
  Zap,
} from "lucide-react";
import { buildBrushStrokeData } from "@/lib/geometry";
import type { BoardElement } from "@/types/board";
import type { AudioControlUpdate } from "./AudioElementNode";

interface LayersPanelProps {
  elements: BoardElement[];
  selectedIds: string[];
  canEdit: boolean;
  onSelectElements: (ids: string[]) => void;
  onPatchElement: (id: string, patch: Partial<BoardElement>) => void;
  onDeleteElements: (ids: string[]) => void;
  onDuplicateElement: (id: string) => void;
  onMoveLayer: (id: string, direction: "up" | "down") => void;
  onReorderLayer: (draggedId: string, targetId: string) => void;
  onTriggerVideo: (
    id: string,
    opts?: { playing?: boolean; visible?: boolean; restart?: boolean }
  ) => void;
  onControlAudio?: (id: string, update: AudioControlUpdate) => void;
  onHideAllVideos: () => void;
  onShowAllLayers: () => void;
}

/**
 * Renders a miniature visual frame of the element (e.g. real freehand SVG stroke preview
 * instead of a generic yellow pencil icon).
 */
function LayerPreviewThumb({ element }: { element: BoardElement }) {
  const strokeColor = element.strokeColor ?? "#ffffff";
  const fillColor =
    element.fillColor && element.fillColor !== "transparent"
      ? element.fillColor
      : "none";

  if (element.type === "freehand") {
    const vbW = Math.max(1, element.viewBoxWidth ?? element.width);
    const vbH = Math.max(1, element.viewBoxHeight ?? element.height);
    const strokeData = buildBrushStrokeData(
      element.points ?? [],
      Math.max(4, element.strokeWidth ?? 6),
      element.brushType ?? "pen",
      element.id
    );

    return (
      <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] flex items-center justify-center p-1 shrink-0 overflow-hidden">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full overflow-visible"
        >
          {element.brushType === "dashed-ink" && strokeData.centerlinePath ? (
            <path
              d={strokeData.centerlinePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth={Math.max(3, Math.min(vbW, vbH) * 0.1)}
              strokeLinecap="round"
              strokeDasharray="10 8"
            />
          ) : strokeData.path ? (
            <path d={strokeData.path} fill={strokeColor} />
          ) : (
            <line
              x1={2}
              y1={vbH - 2}
              x2={vbW - 2}
              y2={2}
              stroke={strokeColor}
              strokeWidth={Math.max(3, vbW * 0.12)}
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>
    );
  }

  if (element.type === "rectangle") {
    return (
      <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] flex items-center justify-center p-1 shrink-0">
        <svg viewBox="0 0 32 20" className="w-full h-full">
          <rect
            x="3"
            y="3"
            width="26"
            height="14"
            rx="3"
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth="2.5"
          />
        </svg>
      </div>
    );
  }

  if (element.type === "ellipse") {
    return (
      <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] flex items-center justify-center p-1 shrink-0">
        <svg viewBox="0 0 32 20" className="w-full h-full">
          <ellipse
            cx="16"
            cy="10"
            rx="12"
            ry="7"
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth="2.5"
          />
        </svg>
      </div>
    );
  }

  if (element.type === "line" || element.type === "arrow") {
    return (
      <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] flex items-center justify-center p-1 shrink-0">
        <svg viewBox="0 0 32 20" className="w-full h-full">
          <line
            x1="4"
            y1="16"
            x2="27"
            y2="4"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {element.type === "arrow" && (
            <polyline
              points="20,4 27,4 26,11"
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>
    );
  }

  if (element.type === "text") {
    return (
      <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] flex items-center justify-center shrink-0">
        <span
          className="text-[11px] font-bold leading-none"
          style={{ color: element.textColor ?? "#ffffff" }}
        >
          Aa
        </span>
      </div>
    );
  }

  if (element.type === "image" && element.src) {
    return (
      <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] overflow-hidden shrink-0">
        <img
          src={element.src}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (element.type === "document") {
    const activePage =
      element.documentPages?.[
        Math.max(0, (element.currentPage ?? 1) - 1)
      ];
    return (
      <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] overflow-hidden flex items-center justify-center shrink-0">
        {activePage ? (
          <img
            src={activePage.url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <FileText className="w-3.5 h-3.5 text-amber-400" />
        )}
      </div>
    );
  }

  if (element.type === "audio") {
    return (
      <div className="w-9 h-6 rounded-md bg-black border border-orange-400/35 flex items-center justify-center shrink-0">
        <AudioLines
          className="w-3.5 h-3.5"
          style={{ color: element.waveformColor ?? "#fb923c" }}
        />
      </div>
    );
  }

  return (
    <div className="w-9 h-6 rounded-md bg-studio-950 border border-white/[0.1] flex items-center justify-center shrink-0">
      <Film className="w-3.5 h-3.5 text-sky-400" />
    </div>
  );
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  elements,
  selectedIds,
  canEdit,
  onSelectElements,
  onPatchElement,
  onDeleteElements,
  onDuplicateElement,
  onMoveLayer,
  onReorderLayer,
  onTriggerVideo,
  onControlAudio,
  onHideAllVideos,
  onShowAllLayers,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const sortedLayers = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  const selectedSet = new Set(selectedIds);

  const commitRename = (id: string) => {
    if (renameValue.trim()) {
      onPatchElement(id, { name: renameValue.trim() });
    }
    setRenamingId(null);
  };

  const handleRowClick = (e: React.MouseEvent, id: string, idx: number) => {
    if (e.ctrlKey || e.metaKey) {
      if (selectedSet.has(id)) {
        onSelectElements(selectedIds.filter((s) => s !== id));
      } else {
        onSelectElements([...selectedIds, id]);
      }
      return;
    }

    if (e.shiftKey && selectedIds.length > 0) {
      const anchorId = selectedIds[selectedIds.length - 1];
      const anchorIdx = sortedLayers.findIndex((item) => item.id === anchorId);
      if (anchorIdx >= 0) {
        const start = Math.min(anchorIdx, idx);
        const end = Math.max(anchorIdx, idx);
        onSelectElements(sortedLayers.slice(start, end + 1).map((item) => item.id));
        return;
      }
    }

    onSelectElements([id]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none animate-panel-enter">
      {canEdit && elements.length > 0 && (
        <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onShowAllLayers}
            className="flex-1 py-1.5 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-[10px] font-medium text-zinc-300 transition-colors"
          >
            Mostrar todo
          </button>
          <button
            type="button"
            onClick={onHideAllVideos}
            className="flex-1 py-1.5 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-[10px] font-medium text-zinc-300 transition-colors"
          >
            Ocultar videos
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {sortedLayers.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 space-y-1.5">
            <Layers className="w-7 h-7 mx-auto text-zinc-600" />
            <p className="font-medium text-zinc-400">No hay capas todavía</p>
            <p className="text-[11px]">
              Dibuja en el marco 16:9 o añade archivos desde la Biblioteca.
            </p>
          </div>
        ) : (
          sortedLayers.map((el, idx) => {
            const isSelected = selectedSet.has(el.id);
            const isDropTarget = dropTargetId === el.id && dragId !== el.id;

            return (
              <div
                key={el.id}
                draggable={canEdit && renamingId !== el.id}
                onDragStart={(e) => {
                  setDragId(el.id);
                  e.dataTransfer.setData("application/x-oboards-layer", el.id);
                }}
                onDragOver={(e) => {
                  if (dragId && dragId !== el.id) {
                    e.preventDefault();
                    setDropTargetId(el.id);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetId === el.id) setDropTargetId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId =
                    dragId || e.dataTransfer.getData("application/x-oboards-layer");
                  setDragId(null);
                  setDropTargetId(null);
                  if (sourceId && sourceId !== el.id) {
                    onReorderLayer(sourceId, el.id);
                  }
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropTargetId(null);
                }}
                onClick={(e) => handleRowClick(e, el.id, idx)}
                className={`group relative flex items-center gap-2 px-2 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                  isDropTarget
                    ? "border-sky-400 bg-sky-500/20"
                    : isSelected
                      ? "bg-sky-500/15 border-sky-400/50 text-white"
                      : el.visible
                        ? "bg-studio-950/70 border-white/[0.06] hover:border-white/[0.15] text-zinc-300"
                        : "bg-studio-950/35 border-white/[0.04] text-zinc-500 opacity-65"
                }`}
              >
                <LayerPreviewThumb element={el} />

                <div
                  className="flex-1 min-w-0"
                  onDoubleClick={(e) => {
                    if (!canEdit) return;
                    e.stopPropagation();
                    setRenamingId(el.id);
                    setRenameValue(el.name);
                  }}
                >
                  {renamingId === el.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(el.id)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(el.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full bg-studio-900 border border-sky-400 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                    />
                  ) : (
                    <p
                      className="text-xs font-medium truncate"
                      title={
                        el.createdByName
                          ? `${el.name} (${el.createdByName})`
                          : el.name
                      }
                    >
                      <span>{el.name}</span>
                      {el.createdByName && (
                        <span className="ml-1 text-[10px] font-normal text-zinc-400">
                          ({el.createdByName})
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {canEdit && (
                  <div
                    className="relative flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Hover action pill floats left of pinned Eye/Lock so Eye NEVER shifts position */}
                    <div className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity flex items-center gap-0.5 bg-studio-900/95 border border-white/[0.1] rounded-lg px-1 py-0.5 shadow-lg absolute right-full mr-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onMoveLayer(el.id, "up")}
                        title="Subir capa"
                        aria-label="Subir capa"
                        className="p-0.5 rounded text-zinc-400 hover:text-white disabled:opacity-25"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === sortedLayers.length - 1}
                        onClick={() => onMoveLayer(el.id, "down")}
                        title="Bajar capa"
                        aria-label="Bajar capa"
                        className="p-0.5 rounded text-zinc-400 hover:text-white disabled:opacity-25"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateElement(el.id)}
                        title="Duplicar"
                        aria-label="Duplicar elemento"
                        className="p-1 rounded text-zinc-400 hover:text-sky-300"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteElements([el.id])}
                        title="Eliminar elemento"
                        aria-label="Eliminar elemento"
                        className="p-1 rounded text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {el.type === "audio" && onControlAudio && (
                      <button
                        type="button"
                        onClick={() =>
                          onControlAudio(el.id, {
                            playing: !el.playing,
                            commit: true,
                          })
                        }
                        title={el.playing ? "Pausar audio" : "Reproducir audio"}
                        aria-label={el.playing ? "Pausar audio" : "Reproducir audio"}
                        className="p-1 rounded-md text-orange-400 hover:bg-orange-500/20 transition-colors"
                      >
                        {el.playing ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {el.type === "video" && (
                      <button
                        type="button"
                        onClick={() =>
                          onTriggerVideo(el.id, {
                            restart: true,
                            playing: true,
                            visible: true,
                          })
                        }
                        title="Disparar clip desde 0:00 en OBS"
                        aria-label="Disparar clip"
                        className="p-1 rounded-md text-sky-400 hover:bg-sky-500/20 transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(el.id, { locked: !el.locked })
                      }
                      title={el.locked ? "Desbloquear" : "Bloquear capa"}
                      aria-label={el.locked ? "Desbloquear" : "Bloquear"}
                      className={`p-1 rounded-md transition-colors ${
                        el.locked
                          ? "text-amber-400 hover:bg-amber-500/15"
                          : "text-zinc-500 hover:text-zinc-200 hover:bg-studio-800"
                      }`}
                    >
                      {el.locked ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <Unlock className="w-3 h-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(el.id, { visible: !el.visible })
                      }
                      title={
                        el.visible
                          ? "Ocultar en OBS (semi-transparente aquí)"
                          : "Mostrar en OBS"
                      }
                      aria-label={el.visible ? "Ocultar en OBS" : "Mostrar en OBS"}
                      className={`p-1 rounded-md transition-colors ${
                        el.visible
                          ? "text-emerald-400 hover:bg-emerald-500/15"
                          : "text-zinc-500 hover:text-zinc-200 hover:bg-studio-800"
                      }`}
                    >
                      {el.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
