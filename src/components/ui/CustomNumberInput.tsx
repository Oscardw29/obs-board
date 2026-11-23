"use client";

import React, { useEffect, useState } from "react";

interface CustomNumberInputProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (next: number) => void;
}

export const CustomNumberInput: React.FC<CustomNumberInputProps> = ({
  label,
  value,
  min = -9999,
  max = 9999,
  step = 1,
  unit = "",
  disabled = false,
  onChange,
}) => {
  const [text, setText] = useState(String(Math.round(value)));

  useEffect(() => {
    setText(String(Math.round(value)));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setText(String(Math.round(value)));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    setText(String(clamped));
    onChange(clamped);
  };

  const handleScrubStart = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    e.preventDefault();
    const startX = e.clientX;
    const startVal = value;
    const onMove = (ev: PointerEvent) => {
      const delta = Math.round((ev.clientX - startX) / 2) * step;
      const next = Math.min(max, Math.max(min, Math.round(startVal + delta)));
      onChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="flex items-center rounded-xl bg-studio-950 border border-white/[0.08] focus-within:border-sky-400/70 overflow-hidden transition-colors">
      <span
        onPointerDown={handleScrubStart}
        title="Arrastra horizontalmente para ajustar"
        className={`px-2 py-1.5 text-[10px] font-semibold text-zinc-400 bg-studio-900/80 border-r border-white/[0.06] select-none ${
          disabled ? "" : "cursor-ew-resize hover:text-sky-300"
        }`}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(text);
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commit(String(value + (e.shiftKey ? step * 10 : step)));
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            commit(String(value - (e.shiftKey ? step * 10 : step)));
          }
        }}
        className="w-full min-w-0 bg-transparent px-2 py-1 text-xs font-mono tabular-nums text-zinc-100 outline-none"
      />
      {unit && (
        <span className="pr-2 text-[10px] font-mono text-zinc-500">{unit}</span>
      )}
    </div>
  );
};
