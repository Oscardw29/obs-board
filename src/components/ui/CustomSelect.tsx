"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  previewStyle?: React.CSSProperties;
}

interface CustomSelectProps<T extends string = string> {
  value: T;
  options: Array<CustomSelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function CustomSelect<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = "Seleccionar…",
  searchable = false,
  disabled = false,
  className = "",
  ariaLabel,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 220 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q))
    );
  }, [options, query]);

  const toggleOpen = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const width = Math.max(rect.width, 200);
      const maxH = 260;
      const fitsBelow = rect.bottom + 6 + maxH < window.innerHeight - 12;
      const top = fitsBelow
        ? rect.bottom + 6
        : Math.max(12, rect.top - maxH - 6);
      const left = Math.min(
        Math.max(12, rect.left),
        window.innerWidth - width - 12
      );
      setCoords({ top, left, width });
      setQuery("");
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        listRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`w-full flex items-center justify-between gap-2 rounded-xl bg-studio-950 border border-white/[0.09] hover:border-sky-400/50 disabled:opacity-45 px-2.5 py-1.5 text-xs text-zinc-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${className}`}
      >
        <span className="truncate text-left" style={selected?.previewStyle}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150 ${
            open ? "rotate-180 text-sky-400" : ""
          }`}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
            className="fixed z-[130] rounded-xl bg-studio-900 border border-white/[0.12] shadow-2xl overflow-hidden animate-popover-enter"
          >
            {searchable && (
              <div className="p-1.5 border-b border-white/[0.06] bg-studio-950/60">
                <div className="relative">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar…"
                    className="w-full rounded-lg bg-studio-950 border border-white/[0.08] pl-7 pr-2 py-1 text-xs text-white placeholder:text-zinc-500 focus:border-sky-400 outline-none"
                  />
                </div>
              </div>
            )}

            <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-[11px] text-zinc-500">
                  Sin resultados
                </div>
              ) : (
                filtered.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                        isSelected
                          ? "bg-sky-500/20 text-sky-200"
                          : "text-zinc-200 hover:bg-studio-800"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate" style={opt.previewStyle}>
                          {opt.label}
                        </div>
                        {opt.description && (
                          <div className="text-[10px] text-zinc-500 truncate">
                            {opt.description}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
