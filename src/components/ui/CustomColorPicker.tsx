"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, Pipette } from "lucide-react";
import { PRESET_COLORS } from "@/lib/geometry";

interface CustomColorPickerProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
  allowTransparent?: boolean;
  disabled?: boolean;
  presets?: string[];
  compact?: boolean;
}

const RECENT_STORAGE_KEY = "oboards_recent_colors_v1";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function parseColorToHsva(input: string): {
  h: number;
  s: number;
  v: number;
  a: number;
} {
  if (!input || input === "transparent") {
    return { h: 200, s: 0.78, v: 0.96, a: 0 };
  }

  let r = 56;
  let g = 189;
  let b = 248;
  let a = 1;

  const trimmed = input.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) {
        a = parseInt(hex.slice(6, 8), 16) / 255;
      }
    }
  } else {
    const rgbaMatch = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i.exec(
      trimmed
    );
    if (rgbaMatch) {
      r = Number(rgbaMatch[1]);
      g = Number(rgbaMatch[2]);
      b = Number(rgbaMatch[3]);
      a = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;
    }
  }

  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s, v, a: clamp(a, 0, 1) };
}

function hsvaToRgba(h: number, s: number, v: number, a: number): {
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
  css: string;
} {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (h < 60) {
    rn = c;
    gn = x;
  } else if (h < 120) {
    rn = x;
    gn = c;
  } else if (h < 180) {
    gn = c;
    bn = x;
  } else if (h < 240) {
    gn = x;
    bn = c;
  } else if (h < 300) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  const r = Math.round((rn + m) * 255);
  const g = Math.round((gn + m) * 255);
  const b = Math.round((bn + m) * 255);
  const toHex = (n: number) => clamp(n, 0, 255).toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  const alphaRounded = Number(clamp(a, 0, 1).toFixed(2));
  const css =
    alphaRounded >= 0.99
      ? hex
      : `rgba(${r}, ${g}, ${b}, ${alphaRounded})`;

  return { r, g, b, a: alphaRounded, hex, css };
}

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({
  label,
  value,
  onChange,
  allowTransparent = false,
  disabled = false,
  presets = PRESET_COLORS,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const alphaRef = useRef<HTMLDivElement | null>(null);

  const [hsva, setHsva] = useState(() => parseColorToHsva(value));
  const [hexInput, setHexInput] = useState(value);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [dragMode, setDragMode] = useState<"sv" | "hue" | "alpha" | null>(null);

  useEffect(() => {
    if (!dragMode) {
      setHsva(parseColorToHsva(value));
      setHexInput(value);
    }
  }, [value, dragMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setRecentColors(parsed.slice(0, 8));
      }
    } catch {
      // ignore
    }
  }, [open]);

  const recordRecent = useCallback((color: string) => {
    if (!color || color === "transparent") return;
    try {
      const raw = localStorage.getItem(RECENT_STORAGE_KEY);
      const prev = raw ? (JSON.parse(raw) as string[]) : [];
      const next = [color, ...prev.filter((c) => c !== color)].slice(0, 8);
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      setRecentColors(next);
    } catch {
      // ignore
    }
  }, []);

  const updateFromHsva = useCallback(
    (next: { h: number; s: number; v: number; a: number }) => {
      setHsva(next);
      const res = hsvaToRgba(next.h, next.s, next.v, next.a);
      setHexInput(res.css);
      onChange(res.css);
    },
    [onChange]
  );

  const openPopover = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const popW = 248;
      const popH = 330;
      const left = clamp(rect.right - popW, 12, window.innerWidth - popW - 12);
      const fitsBelow = rect.bottom + 8 + popH < window.innerHeight - 12;
      const top = fitsBelow
        ? rect.bottom + 8
        : Math.max(12, rect.top - popH - 8);
      setCoords({ top, left });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      recordRecent(value);
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, recordRecent, value]);

  const handleSvDrag = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = clamp((clientX - r.left) / r.width, 0, 1);
      const v = clamp(1 - (clientY - r.top) / r.height, 0, 1);
      updateFromHsva({ ...hsva, s, v, a: hsva.a === 0 ? 1 : hsva.a });
    },
    [hsva, updateFromHsva]
  );

  const handleHueDrag = useCallback(
    (clientX: number) => {
      const el = hueRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = clamp((clientX - r.left) / r.width, 0, 1) * 360;
      updateFromHsva({ ...hsva, h, a: hsva.a === 0 ? 1 : hsva.a });
    },
    [hsva, updateFromHsva]
  );

  const handleAlphaDrag = useCallback(
    (clientX: number) => {
      const el = alphaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const a = clamp((clientX - r.left) / r.width, 0.05, 1);
      updateFromHsva({ ...hsva, a });
    },
    [hsva, updateFromHsva]
  );

  useEffect(() => {
    if (!dragMode) return;
    const onMove = (e: PointerEvent) => {
      if (dragMode === "sv") handleSvDrag(e.clientX, e.clientY);
      else if (dragMode === "hue") handleHueDrag(e.clientX);
      else if (dragMode === "alpha") handleAlphaDrag(e.clientX);
    };
    const onUp = () => {
      setDragMode(null);
      recordRecent(value);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragMode, handleAlphaDrag, handleHueDrag, handleSvDrag, recordRecent, value]);

  const supportsEyeDropper = useMemo(
    () => typeof window !== "undefined" && "EyeDropper" in window,
    []
  );

  const handleEyeDropper = async () => {
    try {
      const ED = (window as unknown as {
        EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
      }).EyeDropper;
      if (!ED) return;
      const res = await new ED().open();
      if (res?.sRGBHex) {
        onChange(res.sRGBHex);
        recordRecent(res.sRGBHex);
      }
    } catch {
      // cancelled
    }
  };

  const hueColor = `hsl(${Math.round(hsva.h)}, 100%, 50%)`;
  const isTransparent = !value || value === "transparent";

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-300">{label}</span>
          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[110px]">
            {isTransparent ? "Sin color" : value}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {allowTransparent && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("transparent")}
            title="Transparente"
            aria-label="Sin color"
            className={`h-6 px-2 rounded-lg border text-[10px] inline-flex items-center gap-1 transition-colors ${
              isTransparent
                ? "bg-sky-500/20 border-sky-400 text-sky-200"
                : "bg-studio-950 border-white/[0.08] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Ban className="w-3 h-3" />
            {!compact && <span>Nada</span>}
          </button>
        )}

        {(compact ? presets.slice(0, 5) : presets.slice(0, 7)).map((c) => {
          const active = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(c);
                recordRecent(c);
              }}
              aria-label={`Color ${c}`}
              className={`w-6 h-6 rounded-lg border transition-transform flex items-center justify-center ${
                active
                  ? "border-sky-400 scale-110 ring-2 ring-sky-500/35"
                  : "border-white/[0.14] hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
            >
              {active && (
                <Check
                  className={`w-3 h-3 ${
                    c === "#ffffff" || c === "#facc15" || c === "#e2e8f0"
                      ? "text-zinc-900"
                      : "text-white"
                  }`}
                />
              )}
            </button>
          );
        })}

        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={openPopover}
          aria-label="Abrir selector de color avanzado"
          title="Selector de color personalizado"
          className="h-6 px-2 rounded-lg border border-white/[0.14] bg-studio-950 hover:border-sky-400/60 inline-flex items-center gap-1.5 transition-colors"
        >
          <span
            className="w-3.5 h-3.5 rounded-sm border border-white/20"
            style={{
              background: isTransparent
                ? "linear-gradient(135deg, transparent 45%, #f43f5e 45%, #f43f5e 55%, transparent 55%)"
                : value,
            }}
          />
          <span className="text-[10px] text-zinc-300 font-medium">HEX</span>
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-[120] w-[248px] rounded-2xl bg-studio-900 border border-white/[0.12] shadow-2xl p-3 space-y-3 animate-popover-enter select-none"
          >
            {/* 2D Saturation / Value Pad */}
            <div
              ref={svRef}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragMode("sv");
                handleSvDrag(e.clientX, e.clientY);
              }}
              className="relative w-full h-32 rounded-xl overflow-hidden cursor-crosshair border border-white/[0.08]"
              style={{ backgroundColor: hueColor }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to right, #fff, transparent)",
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to top, #000, transparent)",
                }}
              />
              <div
                className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${hsva.s * 100}%`,
                  top: `${(1 - hsva.v) * 100}%`,
                }}
              />
            </div>

            {/* Hue Slider */}
            <div
              ref={hueRef}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragMode("hue");
                handleHueDrag(e.clientX);
              }}
              className="relative h-3 rounded-full cursor-pointer border border-white/[0.1]"
              style={{
                background:
                  "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
              }}
            >
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-studio-900 shadow pointer-events-none"
                style={{ left: `${(hsva.h / 360) * 100}%` }}
              />
            </div>

            {/* Alpha Slider */}
            <div
              ref={alphaRef}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragMode("alpha");
                handleAlphaDrag(e.clientX);
              }}
              className="relative h-3 rounded-full cursor-pointer border border-white/[0.1] obs-checkerboard overflow-hidden"
            >
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(to right, transparent, ${hsvaToRgba(hsva.h, hsva.s, hsva.v, 1).hex})`,
                }}
              />
              <div
                className="relative top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-studio-900 shadow pointer-events-none"
                style={{ left: `${hsva.a * 100}%` }}
              />
            </div>

            {/* Hex input + Eyedropper */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={hexInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setHexInput(val);
                  if (
                    /^#[0-9a-f]{6}$/i.test(val) ||
                    /^rgba?\(/i.test(val)
                  ) {
                    onChange(val);
                  }
                }}
                onBlur={() => recordRecent(hexInput)}
                spellCheck={false}
                className="flex-1 rounded-lg bg-studio-950 border border-white/[0.08] px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:border-sky-400 outline-none"
              />
              {supportsEyeDropper && (
                <button
                  type="button"
                  onClick={handleEyeDropper}
                  title="Cuentagotas"
                  aria-label="Cuentagotas de color"
                  className="p-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-white transition-colors"
                >
                  <Pipette className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Recent & Studio Swatches */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {presets.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onChange(c);
                      recordRecent(c);
                    }}
                    aria-label={`Elegir ${c}`}
                    className="w-5 h-5 rounded-md border border-white/15 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {recentColors.length > 0 && (
                <div className="pt-1 border-t border-white/[0.06]">
                  <span className="text-[10px] text-zinc-500 block mb-1">
                    Recientes
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {recentColors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onChange(c)}
                        aria-label={`Color reciente ${c}`}
                        className="w-4 h-4 rounded border border-white/15 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
