"use client";

import React from "react";

interface CustomToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const CustomToggle: React.FC<CustomToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between gap-3 text-left rounded-xl px-2.5 py-2 border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
        checked
          ? "bg-sky-500/10 border-sky-500/35"
          : "bg-studio-950/70 border-white/[0.06] hover:border-white/[0.12]"
      } ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="min-w-0">
        {label && (
          <p className="text-xs font-medium text-zinc-200 truncate">{label}</p>
        )}
        {description && (
          <p className="text-[10px] text-zinc-500 truncate">{description}</p>
        )}
      </div>

      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          checked
            ? "bg-sky-500 border-sky-400"
            : "bg-studio-800 border-white/[0.12]"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-150 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
};
