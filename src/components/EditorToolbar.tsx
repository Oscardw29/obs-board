"use client";

import React from "react";
import {
  ArrowUpRight,
  Circle,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ToolType } from "@/types/board";

export type EditorBackdrop = "checker-dark" | "checker-light" | "black" | "chroma";

interface EditorToolbarProps {
  tool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitStage: () => void;
  backdrop: EditorBackdrop;
  onBackdropChange: (next: EditorBackdrop) => void;
}

const TOOLS: Array<{
  id: ToolType;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
  editOnly?: boolean;
}> = [
  { id: "select", label: "Seleccionar", shortcut: "V", icon: MousePointer2 },
  { id: "hand", label: "Mover lienzo", shortcut: "H", icon: Hand },
  { id: "freehand", label: "Lápiz libre", shortcut: "P", icon: Pencil, editOnly: true },
  { id: "rectangle", label: "Rectángulo", shortcut: "R", icon: Square, editOnly: true },
  { id: "ellipse", label: "Elipse", shortcut: "O", icon: Circle, editOnly: true },
  { id: "line", label: "Línea", shortcut: "L", icon: Minus, editOnly: true },
  { id: "arrow", label: "Flecha", shortcut: "A", icon: ArrowUpRight, editOnly: true },
  { id: "text", label: "Texto", shortcut: "T", icon: Type, editOnly: true },
];

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  tool,
  onSelectTool,
  canEdit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onFitStage,
  backdrop,
  onBackdropChange,
}) => {
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-2xl bg-studio-900/95 border border-studio-700/90 px-2 py-1.5 shadow-2xl backdrop-blur-md">
      {/* Drawing tools */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const disabled = t.editOnly && !canEdit;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition ${
                active
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : disabled
                    ? "text-zinc-600 cursor-not-allowed"
                    : "text-zinc-300 hover:text-white hover:bg-studio-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span
                className={`absolute bottom-0.5 right-1 text-[9px] font-mono leading-none ${
                  active ? "text-indigo-200" : "text-zinc-500"
                }`}
              >
                {t.shortcut}
              </span>
            </button>
          );
        })}
      </div>

      {canEdit && (
        <>
          <div className="w-px h-6 bg-studio-700 mx-1" />
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              title="Deshacer (Ctrl+Z)"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 disabled:opacity-35 disabled:hover:bg-transparent transition"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              title="Rehacer (Ctrl+Y)"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 disabled:opacity-35 disabled:hover:bg-transparent transition"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      <div className="w-px h-6 bg-studio-700 mx-1" />

      {/* Zoom & Fit 16:9 */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onZoomOut}
          title="Alejar"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onFitStage}
          title="Encuadrar marco OBS 16:9 (Ctrl+0)"
          className="px-2 h-8 rounded-lg text-xs font-mono text-zinc-200 hover:bg-studio-800 transition flex items-center gap-1"
        >
          <span>{Math.round(zoom * 100)}%</span>
          <Maximize2 className="w-3 h-3 text-indigo-400" />
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          title="Acercar"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-studio-700 mx-1 hidden md:block" />

      {/* Preview Backdrop Switcher (Editor only, OBS is always transparent!) */}
      <div
        className="hidden md:flex items-center gap-1 pl-0.5"
        title="Fondo de vista previa (solo en editor; en OBS siempre es transparente)"
      >
        {(
          [
            ["checker-dark", "Cuadrícula oscura", "obs-checkerboard"],
            ["checker-light", "Cuadrícula clara", "obs-checkerboard-light"],
            ["black", "Fondo negro", "bg-black"],
            ["chroma", "Fondo verde prueba", "bg-emerald-600"],
          ] as const
        ).map(([id, title, cls]) => (
          <button
            key={id}
            type="button"
            onClick={() => onBackdropChange(id)}
            title={`${title} (solo vista previa editor)`}
            className={`w-5 h-5 rounded-md border transition ${cls} ${
              backdrop === id
                ? "border-indigo-400 ring-2 ring-indigo-500/40 scale-110"
                : "border-studio-600 opacity-70 hover:opacity-100"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
