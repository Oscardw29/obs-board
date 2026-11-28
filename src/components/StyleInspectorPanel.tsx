"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  Bold,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Italic,
  Maximize,
  Palette,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Underline,
  Upload,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import {
  BUILT_IN_PRESETS,
  EASING_OPTIONS,
  ENTRANCE_ANIMATIONS,
  EXIT_ANIMATIONS,
  LOOP_ANIMATIONS,
} from "@/lib/animations";
import { uploadMediaFile } from "@/lib/client-media-upload";
import {
  ensureCustomFontLoaded,
  FONT_CATALOG,
  normalizeFontFamilyId,
} from "@/lib/fonts";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type AnimationEasing,
  type BoardElement,
  type BrushType,
  type ElementAnimationConfig,
  type EntranceAnimation,
  type EraserMode,
  type ExitAnimation,
  type LoopAnimation,
  type MediaAsset,
  type StrokeStyle,
  type StylePreset,
  type TextFontFamily,
  type ToolType,
} from "@/types/board";
import {
  formatAudioTime,
  type AudioControlUpdate,
} from "./AudioElementNode";
import { CustomColorPicker } from "./ui/CustomColorPicker";
import { CustomNumberInput } from "./ui/CustomNumberInput";
import { CustomSelect, type CustomSelectOption } from "./ui/CustomSelect";
import { CustomSlider } from "./ui/CustomSlider";
import { CustomToggle } from "./ui/CustomToggle";

export interface DrawDefaults {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  brushType: BrushType;
  brushSmoothing: number;
  brushTaper: number;
  opacity: number;
  defaultText: string;
  fontFamily: TextFontFamily;
  customFontName?: string;
  customFontUrl?: string;
  fontSize: number;
  textBgColor: string;
  textShadow: boolean;
  eraserMode: EraserMode;
  eraserSize: number;
}

interface StyleInspectorPanelProps {
  boardId: string;
  tool: ToolType;
  selectedElements: BoardElement[];
  canEdit: boolean;
  drawDefaults: DrawDefaults;
  customFonts: MediaAsset[];
  onDrawDefaultsChange: (next: DrawDefaults) => void;
  onPatchElement: (id: string, patch: Partial<BoardElement>) => void;
  onBatchPatch: (
    patches: Array<{ elementId: string; patch: Partial<BoardElement> }>
  ) => void;
  onDeleteElements: (ids: string[]) => void;
  onDuplicateElement: (id: string) => void;
  onTriggerVideo: (
    id: string,
    opts?: { playing?: boolean; visible?: boolean; restart?: boolean }
  ) => void;
  onControlAudio: (id: string, update: AudioControlUpdate) => void;
  onInsertTextFromPanel: (text: string) => void;
  onFontUploaded: (asset: MediaAsset) => void;
}

const BRUSH_OPTIONS: Array<{ id: BrushType; label: string; desc: string }> = [
  { id: "pen", label: "Pluma", desc: "Trazo natural" },
  { id: "marker", label: "Marcador", desc: "Firme y uniforme" },
  { id: "highlighter", label: "Resaltador", desc: "Translúcido ancho" },
  { id: "calligraphy", label: "Caligrafía", desc: "Punta biselada 45°" },
  { id: "neon", label: "Neón", desc: "Núcleo luminoso" },
  { id: "chalk", label: "Tiza", desc: "Textura orgánica" },
  { id: "spray", label: "Spray", desc: "Partículas suaves" },
  { id: "dashed-ink", label: "Guionado", desc: "Línea discontinua" },
];

const USER_PRESETS_KEY = "oboards_user_presets_v1";

export const StyleInspectorPanel: React.FC<StyleInspectorPanelProps> = ({
  boardId,
  tool,
  selectedElements,
  canEdit,
  drawDefaults,
  customFonts,
  onDrawDefaultsChange,
  onPatchElement,
  onBatchPatch,
  onDeleteElements,
  onDuplicateElement,
  onTriggerVideo,
  onControlAudio,
  onInsertTextFromPanel,
  onFontUploaded,
}) => {
  // Estilo MUST go first and be selected by default!
  const [tab, setTab] = useState<"style" | "animation" | "presets">("style");
  const [userPresets, setUserPresets] = useState<StylePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [uploadingFont, setUploadingFont] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  const selected = selectedElements.length === 1 ? selectedElements[0] : null;
  const isMulti = selectedElements.length > 1;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_PRESETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StylePreset[];
        if (Array.isArray(parsed)) setUserPresets(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    for (const f of customFonts) {
      const fam = f.metadata?.fontFamily || f.name;
      void ensureCustomFontLoaded(fam, f.url);
    }
  }, [customFonts]);

  const fontOptions: Array<CustomSelectOption<string>> = useMemo(() => {
    const customOpts: Array<CustomSelectOption<string>> = customFonts.map((f) => {
      const fam = f.metadata?.fontFamily || f.name;
      return {
        value: `custom:${f.id}`,
        label: `${fam} (Importada)`,
        description: "Fuente personalizada",
        previewStyle: { fontFamily: `'${fam}', system-ui, sans-serif` },
      };
    });
    const builtInOpts: Array<CustomSelectOption<string>> = FONT_CATALOG.map(
      (f) => ({
        value: f.id,
        label: f.label,
        description: f.sample,
        previewStyle: { fontFamily: f.cssFamily },
      })
    );
    return [...customOpts, ...builtInOpts];
  }, [customFonts]);

  const handleFontUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setFontError(null);
    setUploadingFont(true);
    try {
      const res = await uploadMediaFile(file, { boardId });
      if (res.error || !res.asset) {
        setFontError(res.error || "No se pudo importar la fuente.");
        return;
      }
      const fam = res.asset.metadata?.fontFamily || res.asset.name;
      await ensureCustomFontLoaded(fam, res.asset.url);
      onFontUploaded(res.asset);
      if (selected && selected.type === "text") {
        onPatchElement(selected.id, {
          fontFamily: fam,
          customFontName: fam,
          customFontUrl: res.asset.url,
        });
      } else {
        onDrawDefaultsChange({
          ...drawDefaults,
          fontFamily: fam,
          customFontName: fam,
          customFontUrl: res.asset.url,
        });
      }
    } finally {
      setUploadingFont(false);
      if (fontInputRef.current) fontInputRef.current.value = "";
    }
  };

  const applyFontChoice = (choice: string) => {
    if (choice.startsWith("custom:")) {
      const assetId = choice.slice("custom:".length);
      const asset = customFonts.find((f) => f.id === assetId);
      if (!asset) return;
      const fam = asset.metadata?.fontFamily || asset.name;
      void ensureCustomFontLoaded(fam, asset.url);
      if (selected && selected.type === "text") {
        onPatchElement(selected.id, {
          fontFamily: fam,
          customFontName: fam,
          customFontUrl: asset.url,
        });
      } else {
        onDrawDefaultsChange({
          ...drawDefaults,
          fontFamily: fam,
          customFontName: fam,
          customFontUrl: asset.url,
        });
      }
      return;
    }

    if (selected && selected.type === "text") {
      onPatchElement(selected.id, {
        fontFamily: choice,
        customFontName: undefined,
        customFontUrl: undefined,
      });
    } else {
      onDrawDefaultsChange({
        ...drawDefaults,
        fontFamily: choice,
        customFontName: undefined,
        customFontUrl: undefined,
      });
    }
  };

  const getCurrentFontSelectValue = (): string => {
    const customUrl = selected ? selected.customFontUrl : drawDefaults.customFontUrl;
    if (customUrl) {
      const found = customFonts.find((f) => f.url === customUrl);
      if (found) return `custom:${found.id}`;
    }
    return normalizeFontFamilyId(
      selected ? selected.fontFamily : drawDefaults.fontFamily
    );
  };

  const alignSelection = (
    mode: "left" | "cx" | "right" | "top" | "cy" | "bottom"
  ) => {
    if (!canEdit || selectedElements.length < 2) return;
    const minX = Math.min(...selectedElements.map((e) => e.x));
    const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
    const minY = Math.min(...selectedElements.map((e) => e.y));
    const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    onBatchPatch(
      selectedElements.map((el) => {
        if (mode === "left") return { elementId: el.id, patch: { x: Math.round(minX) } };
        if (mode === "right")
          return { elementId: el.id, patch: { x: Math.round(maxX - el.width) } };
        if (mode === "cx")
          return { elementId: el.id, patch: { x: Math.round(midX - el.width / 2) } };
        if (mode === "top") return { elementId: el.id, patch: { y: Math.round(minY) } };
        if (mode === "bottom")
          return { elementId: el.id, patch: { y: Math.round(maxY - el.height) } };
        return { elementId: el.id, patch: { y: Math.round(midY - el.height / 2) } };
      })
    );
  };

  const applyPreset = (preset: StylePreset) => {
    if (!canEdit) return;
    if (selectedElements.length > 0) {
      onBatchPatch(
        selectedElements.map((el) => ({
          elementId: el.id,
          patch: {
            ...preset.style,
            animation: preset.style.animation
              ? { ...preset.style.animation, triggerKey: Date.now() }
              : el.animation,
          },
        }))
      );
    } else {
      onDrawDefaultsChange({
        ...drawDefaults,
        strokeColor: preset.style.strokeColor ?? drawDefaults.strokeColor,
        fillColor: preset.style.fillColor ?? drawDefaults.fillColor,
        strokeWidth: preset.style.strokeWidth ?? drawDefaults.strokeWidth,
        strokeStyle: preset.style.strokeStyle ?? drawDefaults.strokeStyle,
        brushType: preset.style.brushType ?? drawDefaults.brushType,
        opacity: preset.style.opacity ?? drawDefaults.opacity,
        fontFamily: preset.style.fontFamily ?? drawDefaults.fontFamily,
        textBgColor: preset.style.textBgColor ?? drawDefaults.textBgColor,
        textShadow: preset.style.textShadow ?? drawDefaults.textShadow,
      });
    }
  };

  const handleSaveUserPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    const stylePayload: Partial<BoardElement> = selected
      ? {
          strokeColor: selected.strokeColor,
          fillColor: selected.fillColor,
          strokeWidth: selected.strokeWidth,
          strokeStyle: selected.strokeStyle,
          borderRadius: selected.borderRadius,
          brushType: selected.brushType,
          opacity: selected.opacity,
          fontFamily: selected.fontFamily,
          fontSize: selected.fontSize,
          textColor: selected.textColor,
          textBgColor: selected.textBgColor,
          textShadow: selected.textShadow,
          animation: selected.animation,
        }
      : {
          strokeColor: drawDefaults.strokeColor,
          fillColor: drawDefaults.fillColor,
          strokeWidth: drawDefaults.strokeWidth,
          strokeStyle: drawDefaults.strokeStyle,
          brushType: drawDefaults.brushType,
          opacity: drawDefaults.opacity,
          fontFamily: drawDefaults.fontFamily,
          textBgColor: drawDefaults.textBgColor,
          textShadow: drawDefaults.textShadow,
        };

    const next: StylePreset = {
      id: `up_${Date.now()}`,
      name: presetName.trim(),
      category: "universal",
      style: stylePayload,
    };
    const updated = [next, ...userPresets];
    setUserPresets(updated);
    setPresetName("");
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleDeleteUserPreset = (id: string) => {
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const updateAnimationConfig = (patch: Partial<ElementAnimationConfig>) => {
    if (!selected || !canEdit) return;
    const current = selected.animation ?? {};
    onPatchElement(selected.id, {
      animation: {
        ...current,
        ...patch,
      },
    });
  };

  const tabIndex = tab === "style" ? 0 : tab === "animation" ? 1 : 2;

  return (
    <aside
      data-tour="right-dock"
      className="w-80 shrink-0 h-full bg-studio-900/95 border-l border-white/[0.07] flex flex-col select-none"
    >
      {/* Right Tabs: ESTILO is ALWAYS FIRST & selected by default */}
      <div className="p-2.5 border-b border-white/[0.07]">
        <div className="relative grid grid-cols-3 bg-studio-950 p-1 rounded-xl border border-white/[0.07]">
          <div
            className="absolute top-1 bottom-1 w-[calc(33.333%-4px)] rounded-lg bg-studio-800 border border-white/[0.08] shadow transition-transform duration-200 ease-out"
            style={{
              transform: `translateX(calc(${tabIndex * 100}% + ${tabIndex * 4}px))`,
            }}
          />
          <button
            type="button"
            onClick={() => setTab("style")}
            className={`relative z-10 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              tab === "style" ? "text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>Estilo</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("animation")}
            className={`relative z-10 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              tab === "animation"
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Animación</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("presets")}
            className={`relative z-10 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              tab === "presets"
                ? "text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-sky-400" />
            <span>Presets</span>
          </button>
        </div>
      </div>

      <input
        ref={fontInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={(e) => handleFontUpload(e.target.files)}
      />

      {/* STYLE TAB */}
      {tab === "style" && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs animate-panel-enter">
          {/* Text Tool Panel (when Text tool is active & nothing selected) */}
          {tool === "text" && !selected && !isMulti && canEdit && (
            <div className="rounded-xl bg-sky-500/10 border border-sky-400/35 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-200 uppercase tracking-wider">
                  <TypeIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>Herramienta de Texto</span>
                </span>
              </div>
              <textarea
                rows={3}
                value={drawDefaults.defaultText}
                onChange={(e) =>
                  onDrawDefaultsChange({
                    ...drawDefaults,
                    defaultText: e.target.value,
                  })
                }
                placeholder="Escribe aquí el texto que quieres colocar en el área…"
                className="w-full rounded-xl bg-studio-950 border border-white/[0.12] focus:border-sky-400 px-2.5 py-2 text-xs text-white placeholder:text-zinc-500 outline-none resize-y select-text"
              />
              <button
                type="button"
                onClick={() =>
                  onInsertTextFromPanel(
                    drawDefaults.defaultText.trim() || "Nuevo texto"
                  )
                }
                className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-sky-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir texto al área</span>
              </button>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                También puedes hacer clic en cualquier punto del área 16:9 para
                colocar este texto, o hacer clic sobre un texto ya colocado para
                editarlo directamente.
              </p>
              <CustomSlider
                label="Tamaño de texto"
                min={14}
                max={180}
                unit="px"
                value={drawDefaults.fontSize}
                onChange={(v) =>
                  onDrawDefaultsChange({ ...drawDefaults, fontSize: v })
                }
              />
            </div>
          )}

          {/* Eraser Tool Options */}
          {tool === "eraser" && !selected && !isMulti && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 space-y-3">
              <p className="text-[11px] font-semibold text-rose-200 uppercase tracking-wider">
                Configuración del Borrador
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["object", "Objeto completo"],
                    ["partial", "Borrado parcial"],
                  ] as const
                ).map(([m, lbl]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() =>
                      onDrawDefaultsChange({ ...drawDefaults, eraserMode: m })
                    }
                    className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-colors ${
                      drawDefaults.eraserMode === m
                        ? "bg-rose-600 border-rose-400 text-white"
                        : "bg-studio-950 border-white/[0.08] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <CustomSlider
                label="Tamaño borrador"
                min={10}
                max={84}
                value={drawDefaults.eraserSize}
                unit="px"
                onChange={(v) =>
                  onDrawDefaultsChange({ ...drawDefaults, eraserSize: v })
                }
              />
            </div>
          )}

          {/* Multi-Selection Controls */}
          {isMulti && (
            <div className="space-y-4">
              <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-200">
                    {selectedElements.length} elementos seleccionados
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        onDeleteElements(selectedElements.map((e) => e.id))
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-[11px] text-rose-200 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Borrar grupo</span>
                    </button>
                  )}
                </div>

                {canEdit && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                      Alinear selección
                    </span>
                    <div className="grid grid-cols-6 gap-1">
                      {(
                        [
                          ["left", AlignStartVertical, "Alinear izquierda"],
                          ["cx", AlignCenterVertical, "Centrar horizontal"],
                          ["right", AlignEndVertical, "Alinear derecha"],
                          ["top", AlignStartHorizontal, "Alinear arriba"],
                          ["cy", AlignCenterHorizontal, "Centrar vertical"],
                          ["bottom", AlignEndHorizontal, "Alinear abajo"],
                        ] as const
                      ).map(([mode, Icon, title]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => alignSelection(mode)}
                          title={title}
                          aria-label={title}
                          className="py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {canEdit && (
                <>
                  <CustomColorPicker
                    label="Color de trazo en grupo"
                    value={selectedElements[0]?.strokeColor ?? "#38bdf8"}
                    onChange={(c) =>
                      onBatchPatch(
                        selectedElements.map((el) => ({
                          elementId: el.id,
                          patch:
                            el.type === "text"
                              ? { textColor: c }
                              : { strokeColor: c },
                        }))
                      )
                    }
                  />
                  <CustomSlider
                    label="Opacidad del grupo"
                    min={5}
                    max={100}
                    unit="%"
                    value={Math.round((selectedElements[0]?.opacity ?? 1) * 100)}
                    onChange={(val) =>
                      onBatchPatch(
                        selectedElements.map((el) => ({
                          elementId: el.id,
                          patch: { opacity: val / 100 },
                        }))
                      )
                    }
                  />
                </>
              )}
            </div>
          )}

          {/* Default Tool Style (when nothing selected) */}
          {!selected && !isMulti && (
            <div className="space-y-4">
              <p className="text-[11px] text-zinc-400">
                Estilo predeterminado para nuevos trazos, formas y textos:
              </p>

              {/* Brush Picker */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-zinc-300">
                  Tipo de Pincel
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {BRUSH_OPTIONS.map((b) => {
                    const active = drawDefaults.brushType === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() =>
                          onDrawDefaultsChange({ ...drawDefaults, brushType: b.id })
                        }
                        className={`px-2.5 py-2 rounded-xl border text-left transition-colors ${
                          active
                            ? "bg-sky-500/20 border-sky-400 text-white"
                            : "bg-studio-950 border-white/[0.08] text-zinc-300 hover:border-white/20"
                        }`}
                      >
                        <div className="text-[11px] font-semibold">{b.label}</div>
                        <div className="text-[9px] text-zinc-500">{b.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <CustomColorPicker
                label="Color de trazo / texto"
                value={drawDefaults.strokeColor}
                onChange={(c) =>
                  onDrawDefaultsChange({ ...drawDefaults, strokeColor: c })
                }
              />

              <CustomColorPicker
                label="Relleno de formas"
                allowTransparent
                value={drawDefaults.fillColor}
                onChange={(c) =>
                  onDrawDefaultsChange({ ...drawDefaults, fillColor: c })
                }
              />

              <CustomSlider
                label="Grosor del trazo"
                min={2}
                max={32}
                unit="px"
                value={drawDefaults.strokeWidth}
                onChange={(v) =>
                  onDrawDefaultsChange({ ...drawDefaults, strokeWidth: v })
                }
              />

              <CustomSlider
                label="Suavizado de pincel"
                min={10}
                max={95}
                unit="%"
                value={Math.round(drawDefaults.brushSmoothing * 100)}
                onChange={(v) =>
                  onDrawDefaultsChange({
                    ...drawDefaults,
                    brushSmoothing: v / 100,
                  })
                }
              />

              <CustomSlider
                label="Opacidad inicial"
                min={10}
                max={100}
                unit="%"
                value={Math.round(drawDefaults.opacity * 100)}
                onChange={(v) =>
                  onDrawDefaultsChange({ ...drawDefaults, opacity: v / 100 })
                }
              />

              {/* Default Typography + Import Font */}
              <div className="space-y-2 border-t border-white/[0.07] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-300">
                    Tipografía predeterminada
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={uploadingFont}
                      onClick={() => fontInputRef.current?.click()}
                      className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{uploadingFont ? "Subiendo…" : "Importar fuente"}</span>
                    </button>
                  )}
                </div>
                <CustomSelect
                  searchable
                  ariaLabel="Tipografía predeterminada"
                  value={getCurrentFontSelectValue()}
                  onChange={applyFontChoice}
                  options={fontOptions}
                />
                {fontError && (
                  <p className="text-[10px] text-rose-400">{fontError}</p>
                )}
              </div>
            </div>
          )}

          {/* Selected Single Element Inspector */}
          {selected && (
            <div className="space-y-4">
              {/* Name & Quick Actions */}
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
                  className="w-full rounded-xl bg-studio-950 border border-white/[0.09] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"
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
                      className={`py-1.5 rounded-lg border text-[11px] inline-flex items-center justify-center gap-1 transition-colors ${
                        selected.visible
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                          : "bg-studio-950 border-white/[0.08] text-zinc-400"
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
                      className="py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-zinc-200 text-[11px] inline-flex items-center justify-center gap-1 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteElements([selected.id])}
                      className="py-1.5 rounded-lg bg-studio-950 hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/40 text-zinc-300 hover:text-rose-400 text-[11px] inline-flex items-center justify-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Borrar</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Document Page Navigator */}
              {selected.type === "document" &&
                selected.documentPages &&
                selected.documentPages.length > 0 && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-amber-200">
                        Páginas del documento
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-amber-300">
                        {selected.currentPage ?? 1} /{" "}
                        {selected.documentPages.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!canEdit || (selected.currentPage ?? 1) <= 1}
                        onClick={() =>
                          onPatchElement(selected.id, {
                            currentPage: Math.max(
                              1,
                              (selected.currentPage ?? 1) - 1
                            ),
                          })
                        }
                        className="flex-1 py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.09] text-zinc-200 disabled:opacity-35 inline-flex items-center justify-center gap-1 text-[11px]"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Anterior</span>
                      </button>
                      <button
                        type="button"
                        disabled={
                          !canEdit ||
                          (selected.currentPage ?? 1) >=
                            selected.documentPages.length
                        }
                        onClick={() =>
                          onPatchElement(selected.id, {
                            currentPage: Math.min(
                              selected.documentPages!.length,
                              (selected.currentPage ?? 1) + 1
                            ),
                          })
                        }
                        className="flex-1 py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.09] text-zinc-200 disabled:opacity-35 inline-flex items-center justify-center gap-1 text-[11px]"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto pt-1">
                      {selected.documentPages.map((pg, idx) => {
                        const pageIdx = idx + 1;
                        const active = (selected.currentPage ?? 1) === pageIdx;
                        return (
                          <button
                            key={pg.pageNumber}
                            type="button"
                            disabled={!canEdit}
                            onClick={() =>
                              onPatchElement(selected.id, { currentPage: pageIdx })
                            }
                            className={`relative aspect-[3/4] rounded-md overflow-hidden border transition-[border-color,opacity] ${
                              active
                                ? "border-amber-400 ring-2 ring-amber-400/40"
                                : "border-white/10 opacity-70 hover:opacity-100"
                            }`}
                          >
                            <img
                              src={pg.url}
                              alt={`Página ${pg.pageNumber}`}
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[9px] font-mono text-white">
                              {pg.pageNumber}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Audio Controls */}
              {selected.type === "audio" && canEdit && (
                <div className="rounded-xl bg-orange-500/10 border border-orange-400/35 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-orange-200 uppercase tracking-wider inline-flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-orange-400" />
                      <span>Control de Audio</span>
                    </p>
                    <span className="text-[10px] font-mono tabular-nums text-orange-300">
                      {formatAudioTime(selected.currentTimeSec ?? 0)} /{" "}
                      {formatAudioTime(selected.durationSec ?? 0)}
                    </span>
                  </div>

                  <p className="text-[10px] text-orange-200/80 bg-black/35 border border-orange-400/20 rounded-lg px-2 py-1.5 leading-relaxed">
                    Solo visible en OBoardS. En el stream (OBS) es invisible y
                    solo se escucha el sonido.
                  </p>

                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onControlAudio(selected.id, {
                          playing: !selected.playing,
                          currentTimeSec: selected.currentTimeSec ?? 0,
                          commit: true,
                        })
                      }
                      className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-studio-950 font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {selected.playing ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Pausar</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Reproducir</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onControlAudio(selected.id, {
                          playing: true,
                          currentTimeSec: 0,
                          commit: true,
                        })
                      }
                      title="Reiniciar desde 0:00"
                      aria-label="Reiniciar audio"
                      className="px-3 py-2 rounded-lg bg-studio-900 hover:bg-studio-800 border border-white/[0.08] text-zinc-200 inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {(selected.durationSec ?? 0) > 0 && (
                    <CustomSlider
                      label="Posición (segundos)"
                      min={0}
                      max={Math.max(1, Math.round(selected.durationSec ?? 1))}
                      step={1}
                      unit="s"
                      value={Math.round(selected.currentTimeSec ?? 0)}
                      onChange={(val) =>
                        onControlAudio(selected.id, {
                          playing: Boolean(selected.playing),
                          currentTimeSec: val,
                          commit: false,
                        })
                      }
                      onCommit={(val) =>
                        onControlAudio(selected.id, {
                          playing: Boolean(selected.playing),
                          currentTimeSec: val,
                          commit: true,
                        })
                      }
                    />
                  )}

                  <CustomToggle
                    label="Reproducir en bucle (Loop)"
                    checked={Boolean(selected.loop)}
                    onChange={(checked) =>
                      onControlAudio(selected.id, {
                        playing: Boolean(selected.playing),
                        currentTimeSec: selected.currentTimeSec ?? 0,
                        loop: checked,
                        commit: true,
                      })
                    }
                  />

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onControlAudio(selected.id, {
                          playing: Boolean(selected.playing),
                          currentTimeSec: selected.currentTimeSec ?? 0,
                          muted: !selected.muted,
                          commit: true,
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
                    <CustomSlider
                      min={0}
                      max={100}
                      unit="%"
                      value={Math.round((selected.volume ?? 0.85) * 100)}
                      onChange={(val) =>
                        onControlAudio(selected.id, {
                          playing: Boolean(selected.playing),
                          currentTimeSec: selected.currentTimeSec ?? 0,
                          volume: val / 100,
                          muted: val === 0,
                          commit: true,
                        })
                      }
                    />
                  </div>

                  <CustomColorPicker
                    label="Color del visualizador"
                    value={selected.waveformColor ?? "#fb923c"}
                    onChange={(c) =>
                      onPatchElement(selected.id, { waveformColor: c })
                    }
                  />
                </div>
              )}

              {/* Video Controls */}
              {selected.type === "video" && canEdit && (
                <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 p-3 space-y-3">
                  <p className="text-[11px] font-semibold text-sky-200 uppercase tracking-wider">
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
                      className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
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
                      aria-label={selected.playing ? "Pausar" : "Reanudar"}
                      className="px-3 py-2 rounded-lg bg-studio-900 hover:bg-studio-800 border border-white/[0.08] text-zinc-200 inline-flex items-center gap-1"
                    >
                      {selected.playing ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <CustomToggle
                      label="Auto-ocultar al terminar"
                      description="Oculta en OBS al finalizar el clip"
                      checked={Boolean(selected.autoHideOnEnd)}
                      onChange={(checked) =>
                        onPatchElement(selected.id, {
                          autoHideOnEnd: checked,
                          loop: checked ? false : selected.loop,
                        })
                      }
                    />
                    <CustomToggle
                      label="Reproducir en bucle (Loop)"
                      checked={Boolean(selected.loop)}
                      onChange={(checked) =>
                        onPatchElement(selected.id, {
                          loop: checked,
                          autoHideOnEnd: checked ? false : selected.autoHideOnEnd,
                        })
                      }
                    />
                  </div>

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
                    </div>
                    <CustomSlider
                      min={0}
                      max={100}
                      unit="%"
                      value={Math.round((selected.volume ?? 0.85) * 100)}
                      onChange={(val) =>
                        onPatchElement(selected.id, {
                          volume: val / 100,
                          muted: val === 0,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {/* Freehand Brush Type Switcher */}
              {selected.type === "freehand" && canEdit && (
                <div className="space-y-2 border-t border-white/[0.07] pt-3">
                  <span className="text-[11px] font-medium text-zinc-300">
                    Tipo de pincel
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {BRUSH_OPTIONS.map((b) => {
                      const active = (selected.brushType ?? "pen") === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() =>
                            onPatchElement(selected.id, { brushType: b.id })
                          }
                          className={`px-2 py-1.5 rounded-lg border text-left text-[11px] font-medium transition-colors ${
                            active
                              ? "bg-sky-500/20 border-sky-400 text-sky-200"
                              : "bg-studio-950 border-white/[0.08] text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
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
                  <div className="space-y-3 border-t border-white/[0.07] pt-3">
                    <CustomColorPicker
                      label="Color de trazo"
                      value={selected.strokeColor ?? "#ffffff"}
                      onChange={(c) =>
                        onPatchElement(selected.id, { strokeColor: c })
                      }
                    />

                    {(selected.type === "rectangle" ||
                      selected.type === "ellipse") && (
                      <CustomColorPicker
                        label="Color de relleno"
                        allowTransparent
                        value={selected.fillColor ?? "transparent"}
                        onChange={(c) =>
                          onPatchElement(selected.id, { fillColor: c })
                        }
                      />
                    )}

                    <CustomSlider
                      label="Grosor"
                      min={1}
                      max={36}
                      unit="px"
                      value={selected.strokeWidth ?? 4}
                      onChange={(v) =>
                        onPatchElement(selected.id, { strokeWidth: v })
                      }
                    />

                    {selected.type !== "freehand" && (
                      <div className="grid grid-cols-3 gap-1">
                        {(
                          [
                            ["solid", "Sólido"],
                            ["dashed", "Guiones"],
                            ["dotted", "Puntos"],
                          ] as const
                        ).map(([st, lbl]) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() =>
                              onPatchElement(selected.id, { strokeStyle: st })
                            }
                            className={`py-1.5 rounded-lg border text-[11px] transition-colors ${
                              (selected.strokeStyle ?? "solid") === st
                                ? "bg-sky-600 border-sky-500 text-white"
                                : "bg-studio-950 border-white/[0.08] text-zinc-400"
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    )}

                    {selected.type === "rectangle" && (
                      <CustomSlider
                        label="Radio de esquina"
                        min={0}
                        max={80}
                        unit="px"
                        value={selected.borderRadius ?? 12}
                        onChange={(v) =>
                          onPatchElement(selected.id, { borderRadius: v })
                        }
                      />
                    )}
                  </div>
                )}

              {/* Text Controls */}
              {selected.type === "text" && canEdit && (
                <div className="space-y-3 border-t border-white/[0.07] pt-3">
                  {/* Direct Text Content Field in Right Menu */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="inspector-text-content"
                      className="text-[11px] font-semibold text-sky-200 flex items-center justify-between"
                    >
                      <span>Contenido del texto</span>
                      <span className="text-[9px] font-normal text-zinc-500">
                        También editable con clic en el área
                      </span>
                    </label>
                    <textarea
                      id="inspector-text-content"
                      rows={3}
                      value={selected.text ?? ""}
                      onChange={(e) =>
                        onPatchElement(selected.id, { text: e.target.value })
                      }
                      placeholder="Escribe aquí lo que quieres que aparezca…"
                      className="w-full rounded-xl bg-studio-950 border border-sky-400/40 focus:border-sky-400 px-2.5 py-2 text-xs text-white placeholder:text-zinc-500 outline-none resize-y select-text"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-zinc-300">
                        Fuente tipográfica
                      </span>
                      <button
                        type="button"
                        disabled={uploadingFont}
                        onClick={() => fontInputRef.current?.click()}
                        className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{uploadingFont ? "Subiendo…" : "Importar"}</span>
                      </button>
                    </div>
                    <CustomSelect
                      searchable
                      ariaLabel="Seleccionar fuente"
                      value={getCurrentFontSelectValue()}
                      onChange={applyFontChoice}
                      options={fontOptions}
                    />
                    {fontError && (
                      <p className="text-[10px] text-rose-400">{fontError}</p>
                    )}
                  </div>

                  <CustomColorPicker
                    label="Color de texto"
                    value={selected.textColor ?? "#ffffff"}
                    onChange={(c) =>
                      onPatchElement(selected.id, { textColor: c })
                    }
                  />

                  <CustomSlider
                    label="Tamaño de texto"
                    min={14}
                    max={180}
                    unit="px"
                    value={selected.fontSize ?? 36}
                    onChange={(v) =>
                      onPatchElement(selected.id, { fontSize: v })
                    }
                  />

                  {/* Formatting & Align row */}
                  <div className="grid grid-cols-6 gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          fontWeight:
                            selected.fontWeight === "bold" ? "normal" : "bold",
                        })
                      }
                      title="Negrita"
                      aria-label="Negrita"
                      className={`py-1.5 rounded-lg border flex justify-center ${
                        (selected.fontWeight ?? "bold") === "bold"
                          ? "bg-sky-600 border-sky-500 text-white"
                          : "bg-studio-950 border-white/[0.08] text-zinc-400"
                      }`}
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          fontStyle:
                            selected.fontStyle === "italic" ? "normal" : "italic",
                        })
                      }
                      title="Cursiva"
                      aria-label="Cursiva"
                      className={`py-1.5 rounded-lg border flex justify-center ${
                        selected.fontStyle === "italic"
                          ? "bg-sky-600 border-sky-500 text-white"
                          : "bg-studio-950 border-white/[0.08] text-zinc-400"
                      }`}
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onPatchElement(selected.id, {
                          textDecoration:
                            selected.textDecoration === "underline"
                              ? "none"
                              : "underline",
                        })
                      }
                      title="Subrayado"
                      aria-label="Subrayado"
                      className={`py-1.5 rounded-lg border flex justify-center ${
                        selected.textDecoration === "underline"
                          ? "bg-sky-600 border-sky-500 text-white"
                          : "bg-studio-950 border-white/[0.08] text-zinc-400"
                      }`}
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
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
                        aria-label={`Alinear ${align}`}
                        className={`py-1.5 rounded-lg border flex justify-center ${
                          (selected.textAlign ?? "left") === align
                            ? "bg-sky-600 border-sky-500 text-white"
                            : "bg-studio-950 border-white/[0.08] text-zinc-400"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>

                  <CustomColorPicker
                    label="Fondo de pastilla"
                    allowTransparent
                    value={selected.textBgColor ?? "transparent"}
                    onChange={(c) =>
                      onPatchElement(selected.id, { textBgColor: c })
                    }
                  />

                  <CustomSlider
                    label="Contorno de texto"
                    min={0}
                    max={8}
                    unit="px"
                    value={selected.textStrokeWidth ?? 0}
                    onChange={(v) =>
                      onPatchElement(selected.id, { textStrokeWidth: v })
                    }
                  />

                  {(selected.textStrokeWidth ?? 0) > 0 && (
                    <CustomColorPicker
                      label="Color de contorno"
                      value={selected.textStrokeColor ?? "#000000"}
                      onChange={(c) =>
                        onPatchElement(selected.id, { textStrokeColor: c })
                      }
                    />
                  )}

                  <CustomToggle
                    label="Sombra proyectada"
                    checked={Boolean(selected.textShadow)}
                    onChange={(checked) =>
                      onPatchElement(selected.id, { textShadow: checked })
                    }
                  />
                </div>
              )}

              {/* Opacity & Transform */}
              <div className="space-y-3 border-t border-white/[0.07] pt-3">
                <CustomSlider
                  label="Opacidad"
                  disabled={!canEdit}
                  min={5}
                  max={100}
                  unit="%"
                  value={Math.round((selected.opacity ?? 1) * 100)}
                  onChange={(v) =>
                    onPatchElement(selected.id, { opacity: v / 100 })
                  }
                />

                <div className="grid grid-cols-2 gap-2">
                  <CustomNumberInput
                    label="X"
                    disabled={!canEdit}
                    value={selected.x}
                    onChange={(v) => onPatchElement(selected.id, { x: v })}
                  />
                  <CustomNumberInput
                    label="Y"
                    disabled={!canEdit}
                    value={selected.y}
                    onChange={(v) => onPatchElement(selected.id, { y: v })}
                  />
                  <CustomNumberInput
                    label="W"
                    min={10}
                    disabled={!canEdit}
                    value={selected.width}
                    onChange={(v) =>
                      onPatchElement(selected.id, { width: Math.max(10, v) })
                    }
                  />
                  <CustomNumberInput
                    label="H"
                    min={10}
                    disabled={!canEdit}
                    value={selected.height}
                    onChange={(v) =>
                      onPatchElement(selected.id, { height: Math.max(10, v) })
                    }
                  />
                </div>

                <CustomSlider
                  label="Rotación"
                  disabled={!canEdit}
                  min={-180}
                  max={180}
                  unit="°"
                  value={Math.round(selected.rotation ?? 0)}
                  onChange={(v) =>
                    onPatchElement(selected.id, { rotation: v })
                  }
                />

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
                      className="py-1.5 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-[11px] text-zinc-300 transition-colors"
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
                      className="py-1.5 px-2 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-[11px] text-zinc-300 inline-flex items-center justify-center gap-1 transition-colors"
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

      {/* ANIMATION TAB */}
      {tab === "animation" && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs animate-panel-enter">
          {!selected ? (
            <div className="py-12 text-center space-y-2 text-zinc-500">
              <Sparkles className="w-7 h-7 mx-auto text-sky-400/60" />
              <p className="text-xs font-medium text-zinc-300">
                Selecciona un elemento
              </p>
              <p className="text-[11px] leading-relaxed">
                Configura animaciones de entrada, bucle continuo y salida en
                OBS para cualquier texto, forma, imagen, documento o clip.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-200 truncate">
                  {selected.name}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      updateAnimationConfig({ triggerKey: Date.now() })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>Probar</span>
                  </button>
                )}
              </div>

              <div className="space-y-2 rounded-xl bg-studio-950/75 border border-white/[0.07] p-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-sky-300">
                  Animación de Entrada
                </span>
                <CustomSelect
                  disabled={!canEdit}
                  value={selected.animation?.entrance ?? "none"}
                  onChange={(val) =>
                    updateAnimationConfig({
                      entrance: val as EntranceAnimation,
                      triggerKey: Date.now(),
                    })
                  }
                  options={ENTRANCE_ANIMATIONS.map((a) => ({
                    value: a.id,
                    label: a.label,
                  }))}
                />
                <CustomSlider
                  label="Duración"
                  disabled={!canEdit}
                  min={150}
                  max={2000}
                  step={50}
                  unit="ms"
                  value={selected.animation?.entranceDurationMs ?? 450}
                  onChange={(v) =>
                    updateAnimationConfig({ entranceDurationMs: v })
                  }
                />
                <CustomSlider
                  label="Retraso"
                  disabled={!canEdit}
                  min={0}
                  max={2000}
                  step={50}
                  unit="ms"
                  value={selected.animation?.entranceDelayMs ?? 0}
                  onChange={(v) =>
                    updateAnimationConfig({ entranceDelayMs: v })
                  }
                />
                <CustomSelect
                  disabled={!canEdit}
                  value={
                    selected.animation?.entranceEasing ??
                    "cubic-bezier(0.23, 1, 0.32, 1)"
                  }
                  onChange={(val) =>
                    updateAnimationConfig({
                      entranceEasing: val as AnimationEasing,
                      triggerKey: Date.now(),
                    })
                  }
                  options={EASING_OPTIONS.map((e) => ({
                    value: e.id,
                    label: e.label,
                  }))}
                />
              </div>

              <div className="space-y-2 rounded-xl bg-studio-950/75 border border-white/[0.07] p-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-300">
                  Animación en Bucle
                </span>
                <CustomSelect
                  disabled={!canEdit}
                  value={selected.animation?.loop ?? "none"}
                  onChange={(val) =>
                    updateAnimationConfig({ loop: val as LoopAnimation })
                  }
                  options={LOOP_ANIMATIONS.map((a) => ({
                    value: a.id,
                    label: a.label,
                  }))}
                />
                <CustomSlider
                  label="Ciclo bucle"
                  disabled={!canEdit}
                  min={500}
                  max={6000}
                  step={100}
                  unit="ms"
                  value={selected.animation?.loopDurationMs ?? 2400}
                  onChange={(v) => updateAnimationConfig({ loopDurationMs: v })}
                />
              </div>

              <div className="space-y-2 rounded-xl bg-studio-950/75 border border-white/[0.07] p-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300">
                  Animación de Salida (al ocultar en OBS)
                </span>
                <CustomSelect
                  disabled={!canEdit}
                  value={selected.animation?.exit ?? "none"}
                  onChange={(val) =>
                    updateAnimationConfig({ exit: val as ExitAnimation })
                  }
                  options={EXIT_ANIMATIONS.map((a) => ({
                    value: a.id,
                    label: a.label,
                  }))}
                />
                <CustomSlider
                  label="Duración salida"
                  disabled={!canEdit}
                  min={150}
                  max={1500}
                  step={50}
                  unit="ms"
                  value={selected.animation?.exitDurationMs ?? 320}
                  onChange={(v) => updateAnimationConfig({ exitDurationMs: v })}
                />
              </div>

              <CustomSlider
                label="Intensidad de movimiento"
                disabled={!canEdit}
                min={0.3}
                max={2}
                step={0.1}
                unit="×"
                value={selected.animation?.intensity ?? 1}
                onChange={(v) => updateAnimationConfig({ intensity: v })}
              />
            </div>
          )}
        </div>
      )}

      {/* PRESETS TAB */}
      {tab === "presets" && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs animate-panel-enter">
          <p className="text-[11px] text-zinc-400">
            Aplica un preset completo (estilo + pincel + animación) con un clic.
          </p>

          {canEdit && (
            <form
              onSubmit={handleSaveUserPreset}
              className="flex gap-1.5 bg-studio-950 p-2 rounded-xl border border-white/[0.08]"
            >
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Guardar estilo actual como…"
                className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 outline-none px-1.5"
              />
              <button
                type="submit"
                disabled={!presetName.trim()}
                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Guardar</span>
              </button>
            </form>
          )}

          {userPresets.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Tus presets guardados
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {userPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-studio-950 border border-white/[0.08] hover:border-sky-400/50 p-2 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                    >
                      <span
                        className="w-5 h-5 rounded-md border border-white/20 shrink-0"
                        style={{
                          backgroundColor:
                            preset.style.fillColor &&
                            preset.style.fillColor !== "transparent"
                              ? preset.style.fillColor
                              : preset.style.strokeColor ?? "#38bdf8",
                          borderColor: preset.style.strokeColor ?? "#38bdf8",
                        }}
                      />
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {preset.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUserPreset(preset.id)}
                      aria-label="Eliminar preset"
                      className="p-1 rounded text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Presets de estudio OBoardS
            </span>
            <div className="grid grid-cols-1 gap-2">
              {BUILT_IN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => applyPreset(preset)}
                  className="flex items-center justify-between gap-2 rounded-xl bg-studio-950 hover:bg-studio-850 border border-white/[0.08] hover:border-sky-400/50 p-2.5 text-left transition-colors disabled:opacity-45"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-7 h-7 rounded-lg border-2 shrink-0 flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor:
                          preset.style.fillColor &&
                          preset.style.fillColor !== "transparent"
                            ? preset.style.fillColor
                            : preset.style.textBgColor ?? "#10131c",
                        borderColor: preset.style.strokeColor ?? "#38bdf8",
                        color: preset.style.textColor ?? "#ffffff",
                      }}
                    >
                      Aa
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-100 truncate">
                        {preset.name}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {preset.style.brushType
                          ? `Pincel ${preset.style.brushType}`
                          : "Estilo texto"}
                        {preset.style.animation?.entrance &&
                        preset.style.animation.entrance !== "none"
                          ? ` · ${preset.style.animation.entrance}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-sky-400 font-medium shrink-0">
                    Aplicar
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
