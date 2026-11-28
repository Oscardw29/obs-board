"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  Eraser,
  FileText,
  Grid3x3,
  ImagePlus,
  Magnet,
  Maximize2,
  Minus,
  MousePointer2,
  Paintbrush,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  BoardBackgroundConfig,
  MediaAsset,
  ToolType,
} from "@/types/board";
import { CustomSlider } from "./ui/CustomSlider";
import { CustomToggle } from "./ui/CustomToggle";

export type EditorBackdrop =
  | "checker-dark"
  | "checker-light"
  | "black"
  | "chroma"
  | "custom-image";

export interface BoardGuidesConfig {
  enabled: boolean;
  showCenterAxes: boolean;
  showRuleOfThirds: boolean;
  showSafeZones: boolean;
}

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
  boardBackground?: BoardBackgroundConfig;
  imageAssets?: MediaAsset[];
  uploadingBgPhoto?: boolean;
  onUploadBgPhoto?: (file: File) => void;
  onUpdateBoardBackground?: (next: BoardBackgroundConfig) => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  guidesConfig: BoardGuidesConfig;
  onGuidesConfigChange: (next: BoardGuidesConfig) => void;
  onOpenDocumentModal: () => void;
}

const TOOLS: Array<{
  id: ToolType;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
  editOnly?: boolean;
}> = [
  {
    id: "select",
    label: "Seleccionar / Arrastre múltiple",
    shortcut: "V",
    icon: MousePointer2,
  },
  {
    id: "eraser",
    label: "Borrador",
    shortcut: "E",
    icon: Eraser,
    editOnly: true,
  },
  {
    id: "freehand",
    label: "Pincel",
    shortcut: "P",
    icon: Paintbrush,
    editOnly: true,
  },
  {
    id: "rectangle",
    label: "Rectángulo",
    shortcut: "R",
    icon: Square,
    editOnly: true,
  },
  {
    id: "ellipse",
    label: "Elipse",
    shortcut: "O",
    icon: Circle,
    editOnly: true,
  },
  {
    id: "line",
    label: "Línea",
    shortcut: "L",
    icon: Minus,
    editOnly: true,
  },
  {
    id: "arrow",
    label: "Flecha",
    shortcut: "A",
    icon: ArrowUpRight,
    editOnly: true,
  },
  {
    id: "text",
    label: "Texto",
    shortcut: "T",
    icon: Type,
    editOnly: true,
  },
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
  boardBackground,
  imageAssets = [],
  uploadingBgPhoto = false,
  onUploadBgPhoto,
  onUpdateBoardBackground,
  snapEnabled,
  onToggleSnap,
  guidesConfig,
  onGuidesConfigChange,
  onOpenDocumentModal,
}) => {
  const [guidesMenuOpen, setGuidesMenuOpen] = useState(false);
  const [bgPhotoMenuOpen, setBgPhotoMenuOpen] = useState(false);
  const guidesRef = useRef<HTMLDivElement | null>(null);
  const bgPhotoRef = useRef<HTMLDivElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!guidesMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!guidesRef.current?.contains(e.target as Node)) {
        setGuidesMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [guidesMenuOpen]);

  useEffect(() => {
    if (!bgPhotoMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!bgPhotoRef.current?.contains(e.target as Node)) {
        setBgPhotoMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [bgPhotoMenuOpen]);

  return (
    <div
      data-tour="toolbar"
      className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 max-w-full rounded-2xl bg-studio-900/95 border border-white/[0.1] px-2 py-1.5 shadow-2xl backdrop-blur-md"
    >
      {/* Drawing tools (no H hand tool) */}
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
              aria-label={`${t.label} (${t.shortcut})`}
              className={`relative flex items-center justify-center w-8 h-8 rounded-xl transition-colors ${
                active
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : disabled
                    ? "text-zinc-600 cursor-not-allowed"
                    : "text-zinc-300 hover:text-white hover:bg-studio-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span
                className={`absolute bottom-0.5 right-1 text-[8px] font-mono leading-none ${
                  active ? "text-sky-100" : "text-zinc-500"
                }`}
              >
                {t.shortcut}
              </span>
            </button>
          );
        })}

        {canEdit && (
          <button
            type="button"
            onClick={onOpenDocumentModal}
            title="Adjuntar documento (PDF / TXT / MD) y seleccionar páginas"
            aria-label="Adjuntar documento"
            className="flex items-center justify-center w-8 h-8 rounded-xl text-zinc-300 hover:text-white hover:bg-studio-800 transition-colors"
          >
            <FileText className="w-4 h-4 text-sky-400" />
          </button>
        )}
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-0.5" />

      {/* Magnet Snap + Board Guides */}
      <div className="flex items-center gap-0.5" data-tour="snap-guides">
        <button
          type="button"
          onClick={onToggleSnap}
          title="Imán / Alineación automática (M)"
          aria-label="Alternar imán de alineación"
          aria-pressed={snapEnabled}
          className={`relative flex items-center justify-center w-8 h-8 rounded-xl transition-colors ${
            snapEnabled
              ? "bg-sky-500/20 border border-sky-400/50 text-sky-300"
              : "text-zinc-400 hover:text-white hover:bg-studio-800"
          }`}
        >
          <Magnet className="w-4 h-4" />
          <span className="absolute bottom-0.5 right-1 text-[8px] font-mono leading-none opacity-75">
            M
          </span>
        </button>

        <div ref={guidesRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() =>
              onGuidesConfigChange({
                ...guidesConfig,
                enabled: !guidesConfig.enabled,
              })
            }
            title="Mostrar / ocultar líneas guías en el tablero (G)"
            aria-label="Mostrar u ocultar líneas guías"
            aria-pressed={guidesConfig.enabled}
            className={`relative flex items-center justify-center w-7 h-8 rounded-l-xl transition-colors ${
              guidesConfig.enabled
                ? "bg-sky-500/20 border border-r-0 border-sky-400/50 text-sky-300"
                : "text-zinc-400 hover:text-white hover:bg-studio-800"
            }`}
          >
            <Grid3x3 className="w-4 h-4" />
            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono leading-none opacity-75">
              G
            </span>
          </button>
          <button
            type="button"
            onClick={() => setGuidesMenuOpen((v) => !v)}
            title="Opciones de líneas guías"
            aria-label="Configurar líneas guías"
            className={`flex items-center justify-center w-4 h-8 rounded-r-xl transition-colors ${
              guidesConfig.enabled
                ? "bg-sky-500/20 border border-l-0 border-sky-400/50 text-sky-300 hover:bg-sky-500/30"
                : "text-zinc-500 hover:text-white hover:bg-studio-800"
            }`}
          >
            <ChevronDown className="w-3 h-3" />
          </button>

          {guidesMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-52 rounded-xl bg-studio-900 border border-white/[0.12] shadow-2xl p-2 space-y-1 z-50 animate-popover-enter">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Líneas guías (solo editor)
              </p>
              {(
                [
                  ["showCenterAxes", "Ejes centrales (H / V)"],
                  ["showRuleOfThirds", "Regla de tercios (3×3)"],
                  ["showSafeZones", "Márgenes seguros OBS (90%)"],
                ] as const
              ).map(([key, label]) => {
                const active = guidesConfig[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      onGuidesConfigChange({
                        ...guidesConfig,
                        enabled: true,
                        [key]: !active,
                      })
                    }
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-zinc-200 hover:bg-studio-800 transition-colors"
                  >
                    <span>{label}</span>
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        active
                          ? "bg-sky-500 border-sky-400 text-white"
                          : "border-white/20 bg-studio-950"
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <>
          <div className="w-px h-6 bg-white/[0.08] mx-1" />
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              title="Deshacer (Ctrl+Z)"
              aria-label="Deshacer"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              title="Rehacer (Ctrl+Y)"
              aria-label="Rehacer"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      <div className="w-px h-6 bg-white/[0.08] mx-1" />

      {/* Smooth Zoom & Fit 16:9 */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onZoomOut}
          title="Alejar suavemente"
          aria-label="Alejar zoom"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onFitStage}
          title="Encuadrar marco OBS 16:9 (Ctrl+0)"
          aria-label="Encuadrar marco 16:9"
          className="px-2 h-8 rounded-lg text-xs font-mono tabular-nums text-zinc-200 hover:bg-studio-800 transition-colors flex items-center gap-1"
        >
          <span>{Math.round(zoom * 100)}%</span>
          <Maximize2 className="w-3 h-3 text-sky-400" />
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          title="Acercar suavemente"
          aria-label="Acercar zoom"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-300 hover:text-white hover:bg-studio-800 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-white/[0.08] mx-1 hidden md:block" />

      {/* Preview Backdrop Switcher + Custom Photo Background */}
      <div
        className="hidden md:flex items-center gap-1 pl-0.5"
        title="Fondo del tablero (cuadrícula, negro, chroma o foto personalizada)"
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
            aria-label={title}
            className={`w-5 h-5 rounded-md border transition-transform ${cls} ${
              backdrop === id
                ? "border-sky-400 ring-2 ring-sky-500/40 scale-110"
                : "border-white/[0.14] opacity-70 hover:opacity-100"
            }`}
          />
        ))}

        {/* Custom Photo Background Popover */}
        <div ref={bgPhotoRef} className="relative flex items-center ml-0.5">
          <input
            ref={bgFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadBgPhoto?.(f);
              if (bgFileInputRef.current) bgFileInputRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => setBgPhotoMenuOpen((v) => !v)}
            title="Establecer fondo foto personalizado"
            aria-label="Fondo foto personalizado"
            className={`relative w-6 h-6 rounded-md border flex items-center justify-center overflow-hidden transition-transform ${
              backdrop === "custom-image" && boardBackground?.imageUrl
                ? "border-sky-400 ring-2 ring-sky-500/40 scale-110"
                : "border-white/[0.18] bg-studio-850 text-zinc-300 hover:text-white hover:border-sky-400/60"
            }`}
          >
            {boardBackground?.imageUrl ? (
              <img
                src={boardBackground.imageUrl}
                alt="Fondo"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImagePlus className="w-3.5 h-3.5 text-sky-400" />
            )}
          </button>

          {bgPhotoMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl bg-studio-900 border border-white/[0.12] shadow-2xl p-3 space-y-3 z-50 animate-popover-enter">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-200">
                  Fondo Foto Personalizado
                </p>
                {boardBackground?.imageUrl && canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateBoardBackground?.({
                        imageUrl: null,
                        fit: "cover",
                        opacity: 1,
                        showInObs: false,
                      });
                      onBackdropChange("checker-dark");
                    }}
                    className="inline-flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 font-medium"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Quitar</span>
                  </button>
                )}
              </div>

              {boardBackground?.imageUrl && (
                <div className="relative aspect-video rounded-xl overflow-hidden border border-white/[0.1] bg-black">
                  <img
                    src={boardBackground.imageUrl}
                    alt="Vista previa fondo"
                    className="w-full h-full"
                    style={{
                      objectFit: boardBackground.fit ?? "cover",
                      opacity: boardBackground.opacity ?? 1,
                    }}
                  />
                </div>
              )}

              {canEdit && (
                <button
                  type="button"
                  disabled={uploadingBgPhoto}
                  onClick={() => bgFileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {uploadingBgPhoto
                      ? "Subiendo foto…"
                      : boardBackground?.imageUrl
                        ? "Cambiar foto de fondo"
                        : "Subir foto de fondo"}
                  </span>
                </button>
              )}

              {boardBackground?.imageUrl && (
                <div className="space-y-2.5 pt-1 border-t border-white/[0.08]">
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ["cover", "Cubrir (16:9)"],
                        ["contain", "Ajustar completa"],
                      ] as const
                    ).map(([fitMode, lbl]) => (
                      <button
                        key={fitMode}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          onUpdateBoardBackground?.({
                            ...boardBackground,
                            fit: fitMode,
                          });
                          onBackdropChange("custom-image");
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-[10px] font-medium transition-colors ${
                          (boardBackground.fit ?? "cover") === fitMode
                            ? "bg-sky-600 border-sky-400 text-white"
                            : "bg-studio-950 border-white/[0.08] text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  <CustomSlider
                    label="Opacidad del fondo"
                    disabled={!canEdit}
                    min={10}
                    max={100}
                    unit="%"
                    value={Math.round((boardBackground.opacity ?? 1) * 100)}
                    onChange={(v) => {
                      onUpdateBoardBackground?.({
                        ...boardBackground,
                        opacity: v / 100,
                      });
                      onBackdropChange("custom-image");
                    }}
                  />

                  <CustomToggle
                    label="Mostrar también en OBS"
                    description="Si está desactivado, solo se ve en OBoardS"
                    disabled={!canEdit}
                    checked={Boolean(boardBackground.showInObs)}
                    onChange={(checked) => {
                      onUpdateBoardBackground?.({
                        ...boardBackground,
                        showInObs: checked,
                      });
                      onBackdropChange("custom-image");
                    }}
                  />
                </div>
              )}

              {/* Quick pick from existing library images */}
              {imageAssets.length > 0 && canEdit && (
                <div className="space-y-1.5 pt-1 border-t border-white/[0.08]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    O elegir de tu biblioteca
                  </span>
                  <div className="grid grid-cols-4 gap-1.5 max-h-24 overflow-y-auto">
                    {imageAssets.slice(0, 12).map((img) => {
                      const active = boardBackground?.imageUrl === img.url;
                      return (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => {
                            onUpdateBoardBackground?.({
                              imageUrl: img.url,
                              fit: boardBackground?.fit ?? "cover",
                              opacity: boardBackground?.opacity ?? 1,
                              showInObs: boardBackground?.showInObs ?? false,
                            });
                            onBackdropChange("custom-image");
                          }}
                          title={img.name}
                          className={`aspect-video rounded-md overflow-hidden border transition-all ${
                            active
                              ? "border-sky-400 ring-2 ring-sky-400/40"
                              : "border-white/10 opacity-75 hover:opacity-100"
                          }`}
                        >
                          <img
                            src={img.url}
                            alt={img.name}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
