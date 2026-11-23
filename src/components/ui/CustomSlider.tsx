"use client";

import React, { useCallback, useRef, useState } from "react";

interface CustomSliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  ariaLabel?: string;
  className?: string;
}

export const CustomSlider: React.FC<CustomSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  disabled = false,
  onChange,
  onCommit,
  ariaLabel,
  className = "",
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [draftInput, setDraftInput] = useState("");

  const clamped = Math.min(max, Math.max(min, value));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;

  const snapValue = useCallback(
    (raw: number) => {
      const stepped = Math.round((raw - min) / step) * step + min;
      const decimals = step < 1 ? Math.max(1, String(step).split(".")[1]?.length ?? 1) : 0;
      const rounded = Number(stepped.toFixed(decimals));
      return Math.min(max, Math.max(min, rounded));
    },
    [min, max, step]
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return clamped;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return clamped;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return snapValue(min + ratio * (max - min));
    },
    [clamped, max, min, snapValue]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const next = valueFromClientX(e.clientX);
    onChange(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    const next = valueFromClientX(e.clientX);
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    const finalVal = valueFromClientX(e.clientX);
    onCommit?.(finalVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    const bigStep = step * 5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      next = snapValue(clamped + (e.shiftKey ? bigStep : step));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      next = snapValue(clamped - (e.shiftKey ? bigStep : step));
    } else if (e.key === "Home") {
      next = min;
    } else if (e.key === "End") {
      next = max;
    }
    if (next !== null) {
      e.preventDefault();
      onChange(next);
      onCommit?.(next);
    }
  };

  const commitDraft = () => {
    setEditingValue(false);
    const num = Number(draftInput);
    if (!Number.isNaN(num)) {
      const snapped = snapValue(num);
      onChange(snapped);
      onCommit?.(snapped);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {(label || unit !== undefined) && (
        <div className="flex items-center justify-between text-[11px]">
          {label && <span className="text-zinc-300 font-medium">{label}</span>}
          {editingValue && !disabled ? (
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDraft();
                if (e.key === "Escape") setEditingValue(false);
              }}
              className="w-16 rounded-md bg-studio-950 border border-sky-400 px-1.5 py-0.5 text-right text-[11px] font-mono tabular-nums text-white outline-none"
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setDraftInput(String(clamped));
                setEditingValue(true);
              }}
              title="Clic para escribir valor exacto"
              className="px-1.5 py-0.5 rounded-md bg-studio-950/90 border border-white/[0.07] text-[11px] font-mono tabular-nums text-sky-300 hover:border-sky-400/50 transition-colors"
            >
              {clamped}
              {unit}
            </button>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? label ?? "Deslizador"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={`relative h-6 flex items-center select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 rounded-full ${
          disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <div className="w-full h-1.5 rounded-full bg-studio-950 border border-white/[0.08] overflow-hidden relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.6)] transition-transform ${
            dragging ? "scale-125" : "hover:scale-110"
          }`}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
};
