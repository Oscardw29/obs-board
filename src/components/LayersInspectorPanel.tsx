"use client";

import React, { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Layers,
  Lock,
  Maximize,
  Minus,
  Pause,
  Pencil,
  Play,
  Repeat,
  Sliders,
  Square,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { PRESET_COLORS } from "@/lib/geometry";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardElement,
  type StrokeStyle,
  type TextFontFamily,
} from "@/types/board";

export interface DrawDefaults {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  fontFamily: TextFontFamily;
  fontSize: number;
  textBgColor: string;
  textShadow: boolean;
}

interface LayersInspectorPanelProps {
  elements: BoardElement[];
  selectedId: string | null;
  canEdit: boolean;
  drawDefaults: DrawDefaults;
  onDrawDefaultsChange: (next: DrawDefaults) => void;
  onSelectElement: (id: string | null) => void;
  onPatchElement: (id: string, patch: Partial<BoardElement>) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onMoveLayer: (id: string, direction: "up" | "down") => void;
  onTriggerVideo: (
    id: string,
    opts?: { playing?: boolean; visible?: boolean; restart?: boolean }
  ) => void;
  onHideAllVideos: () => void;
  onShowAllLayers: () => void;
}

function ElementTypeIcon({ type }: { type: BoardElement["type"] }) {
  const cls = "w-3.5 h-3.5 shrink-0";
  switch (type) {
    case "freehand":
      return <Pencil className={`${cls} text-amber-400`} />;
    case "rectangle":
      return <Square className={`${cls} text-indigo-400`} />;
    case "ellipse":
      return <Circle className={`${cls} text-sky-400`} />;
    case "line":
      return <Minus className={`${cls} text-zinc-400`} />;
    case "arrow":
      return <ArrowUpRight className={`${cls} text-rose-400`} />;
    case "text":
      return <Type className={`${cls} text-emerald-400`} />;
    case "image":
      return <ImageIcon className={`${cls} text-cyan-400`} />;
    case "video":
      return <Film className={`${cls} text-fuchsia-400`} />;
  }
}

export const LayersInspectorPanel: React.FC<LayersInspectorPanelProps> = ({
  elements,
  selectedId,
  canEdit,
  drawDefaults,
  onDrawDefaultsChange,
  onSelectElement,
  onPatchElement,
  onDeleteElement,
  onDuplicateElement,
  onMoveLayer,
  onTriggerVideo,
  onHideAllVideos,
  onShowAllLayers,
}) => {
  const [tab, setTab] = useState<"layers" | "inspector">("layers");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const sortedLayers = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const commitRename = (id: string) => {
    if (renameValue.trim()) {
      onPatchElement(id, { name: renameValue.trim() });
    }
    setRenamingId(null);
  };

  return (
    <aside className="w-80 shrink-0 h-full bg-studio-900/95 border-l border-studio-800 flex flex-col select-none">
      {/* Tabs */}
      <div className="p-2.5 border-b border-studio-800">
        <div className="grid grid-cols-2 gap-1 bg-studio-950 p-1 rounded-xl border border-studio-800">
          <button
            type="button"
            onClick={() => setTab("layers")}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === "layers"
                ? "bg-studio-800 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Capas ({elements.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("inspector")}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === "inspector"
                ? "bg-studio-800 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>{selected ? "Propiedades" : "Estilo"}</span>
          </button>
        </div>
      </div>

      {/* Selected Quick Banner when on Layers tab */}
      {selected && tab === "layers" && selected.type === "video" && canEdit && (
        <div className="mx-3 mt-3 p-2.5 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fuchsia-200 truncate">
              Clip: {selected.name}
            </span>
            <button
              type="button"
              onClick={() => setTab("inspector")}
              className="text-[10px] text-fuchsia-300 hover:underline shrink-0"
            >
              Ajustes
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onTriggerVideo(selected.id, {
                  restart: true,
                  playing: true,
                  visible: true,
                })
              }
              className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold transition"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Disparar</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onTriggerVideo(selected.id, {
                  playing: !(selected.playing ?? true),
                })
              }
              className="p-1.5 rounded-lg bg-studio-850 hover:bg-studio-800 border border-studio-700 text-zinc-200"
              title={selected.playing ? "Pausar" : "Reanudar"}
            >
              {selected.playing ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                onPatchElement(selected.id, { visible: !selected.visible })
              }
              className="p-1.5 rounded-lg bg-studio-850 hover:bg-studio-800 border border-studio-700 text-zinc-200"
              title={selected.visible ? "Ocultar en OBS" : "Mostrar en OBS"}
            >
              {selected.visible ? (
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* LAYERS TAB */}
      {tab === "layers" && (
        <div className="flex-1 flex flex-col min-h-0">
          {canEdit && elements.length > 0 && (
            <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onShowAllLayers}
                className="flex-1 py-1 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-studio-800 text-[10px] text-zinc-300 transition"
              >
                Mostrar todo
              </button>
              <button
                type="button"
                onClick={onHideAllVideos}
                className="flex-1 py-1 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-studio-800 text-[10px] text-zinc-300 transition"
              >
                Ocultar videos
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {sortedLayers.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500 space-y-1">
                <Layers className="w-7 h-7 mx-auto text-zinc-600" />
                <p>No hay capas todavía</p>
                <p className="text-[11px]">
                  Dibuja en el marco 16:9 o añade clips desde la biblioteca.
                </p>
              </div>
            ) : (
              sortedLayers.map((el, idx) => {
                const isSelected = el.id === selectedId;
                return (
                  <div
                    key={el.id}
                    onClick={() => onSelectElement(el.id)}
                    className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? "bg-indigo-500/15 border-indigo-500/50 text-white"
                        : el.visible
                          ? "bg-studio-950/70 border-studio-800/80 hover:border-studio-700 text-zinc-300"
                          : "bg-studio-950/30 border-studio-800/40 text-zinc-500 opacity-70"
                    }`}
                  >
                    <ElementTypeIcon type={el.type} />

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
                          className="w-full bg-studio-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                        />
                      ) : (
                        <p className="text-xs font-medium truncate">
                          {el.name}
                        </p>
                      )}
                    </div>

                    {canEdit && (
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                            className="p-1 rounded-md text-fuchsia-400 hover:bg-fuchsia-500/20 transition"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            onPatchElement(el.id, { visible: !el.visible })
                          }
                          title={
                            el.visible
                              ? "Ocultar en directo (sin borrar)"
                              : "Mostrar en directo"
                          }
                          className={`p-1 rounded-md transition ${
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

                        <button
                          type="button"
                          onClick={() =>
                            onPatchElement(el.id, { locked: !el.locked })
                          }
                          title={el.locked ? "Desbloquear" : "Bloquear capa"}
                          className={`p-1 rounded-md transition ${
                            el.locked
                              ? "text-amber-400 hover:bg-amber-500/15"
                              : "text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-zinc-200"
                          }`}
                        >
                          {el.locked ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                        </button>

                        <div className="hidden group-hover:flex items-center">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => onMoveLayer(el.id, "up")}
                            title="Subir capa"
                            className="p-0.5 rounded text-zinc-400 hover:text-white disabled:opacity-25"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === sortedLayers.length - 1}
                            onClick={() => onMoveLayer(el.id, "down")}
                            title="Bajar capa"
                            className="p-0.5 rounded text-zinc-400 hover:text-white disabled:opacity-25"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteElement(el.id)}
                            title="Eliminar elemento"
                            className="p-1 rounded text-zinc-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* INSPECTOR / STYLE TAB */}
      {tab === "inspector" && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
          {!selected ? (
            /* Default drawing style settings */
            <div className="space-y-4">
              <p className="text-[11px] text-zinc-400">
                Estilo predeterminado para nuevos trazos, formas y textos:
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-300">
                  Color de trazo / texto
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        onDrawDefaultsChange({ ...drawDefaults, strokeColor: c })
                      }
                      className={`w-6 h-6 rounded-lg border transition ${
                        drawDefaults.strokeColor === c
                          ? "border-indigo-400 scale-110 ring-2 ring-indigo-500/40"
                          : "border-studio-700"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={drawDefaults.strokeColor}
                    onChange={(e) =>
                      onDrawDefaultsChange({
                        ...drawDefaults,
                        strokeColor: e.target.value,
                      })
                    }
                    className="w-6 h-6 rounded-lg bg-transparent cursor-pointer border border-studio-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-300">
                  Relleno de formas
                </label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button
                    type="button"
                    onClick={() =>
                      onDrawDefaultsChange({
                        ...drawDefaults,
                        fillColor: "transparent",
                      })
                    }
                    className={`px-2 h-6 rounded-lg border text-[10px] ${
                      drawDefaults.fillColor === "transparent"
                        ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                        : "border-studio-700 text-zinc-400"
                    }`}
                  >
                    Sin relleno
                  </button>
                  {PRESET_COLORS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        onDrawDefaultsChange({ ...drawDefaults, fillColor: c })
                      }
                      className={`w-6 h-6 rounded-lg border ${
                        drawDefaults.fillColor === c
                          ? "border-indigo-400 scale-110"
                          : "border-studio-700"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-300">Grosor del trazo</span>
                  <span className="font-mono text-zinc-400">
                    {drawDefaults.strokeWidth}px
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={28}
                  value={drawDefaults.strokeWidth}
                  onChange={(e) =>
                    onDrawDefaultsChange({
                      ...drawDefaults,
                      strokeWidth: Number(e.target.value),
                    })
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-300">
                  Tipografía de texto
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ["hand", "Manuscrita"],
                      ["sans", "Moderna"],
                      ["mono", "Mono"],
                    ] as const
                  ).map(([f, label]) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() =>
                        onDrawDefaultsChange({ ...drawDefaults, fontFamily: f })
                      }
                      className={`py-1.5 rounded-lg border text-[11px] ${
                        drawDefaults.fontFamily === f
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-studio-950 border-studio-800 text-zinc-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Selected Element Inspector */
            <div className="space-y-4">
              {/* Name & Quick actions */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  Elemento seleccionado
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={selected.name}
                  onChange={(e) =>
                    onPatchElement(selected.id, { name: e.target.value })
                  }
                  className="w-full rounded-lg bg-studio-950 border border-studio-700 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                {canEdit && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          visible: !selected.visible,
                        })
                      }
                      className={`py-1.5 rounded-lg border text-[11px] inline-flex items-center justify-center gap-1 ${
                        selected.visible
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                          : "bg-studio-950 border-studio-700 text-zinc-400"
                      }`}
                    >
                      {selected.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                      <span>{selected.visible ? "Visible" : "Oculto"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateElement(selected.id)}
                      className="py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 border border-studio-700 text-zinc-200 text-[11px] inline-flex items-center justify-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteElement(selected.id)}
                      className="py-1.5 rounded-lg bg-studio-950 hover:bg-rose-500/15 border border-studio-700 hover:border-rose-500/40 text-zinc-300 hover:text-rose-400 text-[11px] inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Borrar</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Video Controls */}
              {selected.type === "video" && canEdit && (
                <div className="rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 p-3 space-y-3">
                  <p className="text-[11px] font-semibold text-fuchsia-200 uppercase tracking-wider">
                    Control de Clip en OBS
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onTriggerVideo(selected.id, {
                          restart: true,
                          playing: true,
                          visible: true,
                        })
                      }
                      className="flex-1 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 transition"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Disparar 0:00</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onTriggerVideo(selected.id, {
                          playing: !(selected.playing ?? true),
                        })
                      }
                      className="px-3 py-2 rounded-lg bg-studio-900 hover:bg-studio-800 border border-studio-700 text-zinc-200 inline-flex items-center gap-1"
                    >
                      {selected.playing ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          loop: !selected.loop,
                          autoHideOnEnd: !selected.loop
                            ? false
                            : selected.autoHideOnEnd,
                        })
                      }
                      className={`py-1.5 px-2 rounded-lg border text-[11px] inline-flex items-center justify-center gap-1 ${
                        selected.loop
                          ? "bg-indigo-600/30 border-indigo-400 text-indigo-100"
                          : "bg-studio-950 border-studio-700 text-zinc-400"
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>Loop: {selected.loop ? "Sí" : "No"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          autoHideOnEnd: !selected.autoHideOnEnd,
                          loop: !selected.autoHideOnEnd ? false : selected.loop,
                        })
                      }
                      className={`py-1.5 px-2 rounded-lg border text-[11px] inline-flex items-center justify-center gap-1 ${
                        selected.autoHideOnEnd
                          ? "bg-fuchsia-600/30 border-fuchsia-400 text-fuchsia-100"
                          : "bg-studio-950 border-studio-700 text-zinc-400"
                      }`}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Auto-ocultar</span>
                    </button>
                  </div>

                  {/* Audio / Volume */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          onPatchElement(selected.id, {
                            muted: !selected.muted,
                          })
                        }
                        className="inline-flex items-center gap-1.5 text-[11px] text-zinc-200 hover:text-white"
                      >
                        {selected.muted ? (
                          <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span>{selected.muted ? "Silenciado" : "Volumen"}</span>
                      </button>
                      <span className="font-mono text-[11px] text-zinc-400">
                        {Math.round((selected.volume ?? 0.85) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((selected.volume ?? 0.85) * 100)}
                      onChange={(e) =>
                        onPatchElement(selected.id, {
                          volume: Number(e.target.value) / 100,
                          muted: Number(e.target.value) === 0,
                        })
                      }
                      className="w-full accent-fuchsia-500"
                    />
                  </div>
                </div>
              )}

              {/* Stroke / Fill for vector & shapes */}
              {(selected.type === "freehand" ||
                selected.type === "rectangle" ||
                selected.type === "ellipse" ||
                selected.type === "line" ||
                selected.type === "arrow") &&
                canEdit && (
                  <div className="space-y-3 border-t border-studio-800 pt-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400">
                        Color de trazo
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              onPatchElement(selected.id, { strokeColor: c })
                            }
                            className={`w-6 h-6 rounded-lg border ${
                              selected.strokeColor === c
                                ? "border-indigo-400 scale-110"
                                : "border-studio-700"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={selected.strokeColor ?? "#ffffff"}
                          onChange={(e) =>
                            onPatchElement(selected.id, {
                              strokeColor: e.target.value,
                            })
                          }
                          className="w-6 h-6 rounded-lg bg-transparent cursor-pointer border border-studio-700"
                        />
                      </div>
                    </div>

                    {(selected.type === "rectangle" ||
                      selected.type === "ellipse") && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-zinc-400">
                          Color de relleno
                        </label>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <button
                            type="button"
                            onClick={() =>
                              onPatchElement(selected.id, {
                                fillColor: "transparent",
                              })
                            }
                            className={`px-2 h-6 rounded-lg border text-[10px] ${
                              !selected.fillColor ||
                              selected.fillColor === "transparent"
                                ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                                : "border-studio-700 text-zinc-400"
                            }`}
                          >
                            Transparente
                          </button>
                          {PRESET_COLORS.slice(0, 6).map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() =>
                                onPatchElement(selected.id, { fillColor: c })
                              }
                              className="w-6 h-6 rounded-lg border border-studio-700"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <input
                            type="color"
                            value={
                              selected.fillColor &&
                              selected.fillColor !== "transparent"
                                ? selected.fillColor
                                : "#111827"
                            }
                            onChange={(e) =>
                              onPatchElement(selected.id, {
                                fillColor: e.target.value,
                              })
                            }
                            className="w-6 h-6 rounded-lg bg-transparent cursor-pointer border border-studio-700"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-zinc-400">Grosor</span>
                        <span className="font-mono text-zinc-300">
                          {selected.strokeWidth ?? 4}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={32}
                        value={selected.strokeWidth ?? 4}
                        onChange={(e) =>
                          onPatchElement(selected.id, {
                            strokeWidth: Number(e.target.value),
                          })
                        }
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>
                )}

              {/* Text Controls */}
              {selected.type === "text" && canEdit && (
                <div className="space-y-3 border-t border-studio-800 pt-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400">
                      Color de texto
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            onPatchElement(selected.id, { textColor: c })
                          }
                          className="w-6 h-6 rounded-lg border border-studio-700"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <input
                        type="color"
                        value={selected.textColor ?? "#ffffff"}
                        onChange={(e) =>
                          onPatchElement(selected.id, {
                            textColor: e.target.value,
                          })
                        }
                        className="w-6 h-6 rounded-lg bg-transparent cursor-pointer border border-studio-700"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">Tamaño</span>
                      <span className="font-mono text-zinc-300">
                        {selected.fontSize ?? 36}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={140}
                      value={selected.fontSize ?? 36}
                      onChange={(e) =>
                        onPatchElement(selected.id, {
                          fontSize: Number(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ["hand", "Manuscrita"],
                        ["sans", "Moderna"],
                        ["mono", "Mono"],
                      ] as const
                    ).map(([f, label]) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() =>
                          onPatchElement(selected.id, { fontFamily: f })
                        }
                        className={`py-1.5 rounded-lg border text-[11px] ${
                          selected.fontFamily === f
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-studio-950 border-studio-800 text-zinc-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        ["left", AlignLeft],
                        ["center", AlignCenter],
                        ["right", AlignRight],
                      ] as const
                    ).map(([align, Icon]) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() =>
                          onPatchElement(selected.id, { textAlign: align })
                        }
                        className={`flex-1 py-1.5 rounded-lg border flex justify-center ${
                          (selected.textAlign ?? "left") === align
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-studio-950 border-studio-800 text-zinc-400"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          textShadow: !selected.textShadow,
                        })
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] ${
                        selected.textShadow
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-studio-950 border-studio-800 text-zinc-400"
                      }`}
                    >
                      Sombra
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          textBgColor:
                            selected.textBgColor &&
                            selected.textBgColor !== "transparent"
                              ? "transparent"
                              : "rgba(17, 24, 39, 0.78)",
                        })
                      }
                      className={`flex-1 py-1.5 rounded-lg border text-[11px] ${
                        selected.textBgColor &&
                        selected.textBgColor !== "transparent"
                          ? "bg-indigo-500/20 border-indigo-400 text-indigo-200"
                          : "bg-studio-950 border-studio-800 text-zinc-400"
                      }`}
                    >
                      Fondo pastilla:{" "}
                      {selected.textBgColor &&
                      selected.textBgColor !== "transparent"
                        ? "Sí"
                        : "No"}
                    </button>
                  </div>
                </div>
              )}

              {/* Opacity & Transform */}
              <div className="space-y-3 border-t border-studio-800 pt-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Opacidad</span>
                    <span className="font-mono text-zinc-300">
                      {Math.round((selected.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    disabled={!canEdit}
                    min={5}
                    max={100}
                    value={Math.round((selected.opacity ?? 1) * 100)}
                    onChange={(e) =>
                      onPatchElement(selected.id, {
                        opacity: Number(e.target.value) / 100,
                      })
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">X</label>
                    <input
                      type="number"
                      disabled={!canEdit}
                      value={Math.round(selected.x)}
                      onChange={(e) =>
                        onPatchElement(selected.id, { x: Number(e.target.value) })
                      }
                      className="w-full rounded-lg bg-studio-950 border border-studio-800 px-2 py-1 text-xs font-mono text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Y</label>
                    <input
                      type="number"
                      disabled={!canEdit}
                      value={Math.round(selected.y)}
                      onChange={(e) =>
                        onPatchElement(selected.id, { y: Number(e.target.value) })
                      }
                      className="w-full rounded-lg bg-studio-950 border border-studio-800 px-2 py-1 text-xs font-mono text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Ancho</label>
                    <input
                      type="number"
                      disabled={!canEdit}
                      min={10}
                      value={Math.round(selected.width)}
                      onChange={(e) =>
                        onPatchElement(selected.id, {
                          width: Math.max(10, Number(e.target.value)),
                        })
                      }
                      className="w-full rounded-lg bg-studio-950 border border-studio-800 px-2 py-1 text-xs font-mono text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Alto</label>
                    <input
                      type="number"
                      disabled={!canEdit}
                      min={10}
                      value={Math.round(selected.height)}
                      onChange={(e) =>
                        onPatchElement(selected.id, {
                          height: Math.max(10, Number(e.target.value)),
                        })
                      }
                      className="w-full rounded-lg bg-studio-950 border border-studio-800 px-2 py-1 text-xs font-mono text-zinc-200"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Rotación</span>
                    <span className="font-mono text-zinc-300">
                      {Math.round(selected.rotation ?? 0)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    disabled={!canEdit}
                    min={-180}
                    max={180}
                    value={Math.round(selected.rotation ?? 0)}
                    onChange={(e) =>
                      onPatchElement(selected.id, {
                        rotation: Number(e.target.value),
                      })
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>

                {canEdit && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          x: Math.round((STAGE_WIDTH - selected.width) / 2),
                          y: Math.round((STAGE_HEIGHT - selected.height) / 2),
                        })
                      }
                      className="py-1.5 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-studio-800 text-[11px] text-zinc-300 transition"
                    >
                      Centrar en OBS
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          x: 0,
                          y: 0,
                          width: STAGE_WIDTH,
                          height: STAGE_HEIGHT,
                          rotation: 0,
                        })
                      }
                      className="py-1.5 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-studio-800 text-[11px] text-zinc-300 inline-flex items-center justify-center gap-1 transition"
                    >
                      <Maximize className="w-3 h-3" />
                      <span>1080p Full</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
