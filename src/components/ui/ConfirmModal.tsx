"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  checkboxLabel?: string;
  defaultCheckboxChecked?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (checkboxChecked: boolean) => void | Promise<void>;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  checkboxLabel,
  defaultCheckboxChecked = false,
  loading = false,
  onCancel,
  onConfirm,
}) => {
  const [checked, setChecked] = useState(defaultCheckboxChecked);

  useEffect(() => {
    if (open) setChecked(defaultCheckboxChecked);
  }, [open, defaultCheckboxChecked]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overscroll-contain"
      onClick={() => !loading && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-studio-900 border border-white/[0.1] shadow-2xl p-5 space-y-4 animate-modal-enter"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                destructive
                  ? "bg-rose-500/15 border-rose-500/35 text-rose-400"
                  : "bg-sky-500/15 border-sky-500/35 text-sky-400"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            aria-label="Cerrar diálogo"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {checkboxLabel && (
          <button
            type="button"
            onClick={() => setChecked((v) => !v)}
            className="w-full flex items-center gap-2.5 rounded-xl bg-studio-950 border border-white/[0.08] hover:border-white/[0.15] px-3 py-2.5 text-left transition-colors"
          >
            <span
              className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                checked
                  ? destructive
                    ? "bg-rose-500 border-rose-400 text-white"
                    : "bg-sky-500 border-sky-400 text-white"
                  : "bg-studio-900 border-white/20"
              }`}
            >
              {checked && <Check className="w-3 h-3" />}
            </span>
            <span className="text-xs text-zinc-200">{checkboxLabel}</span>
          </button>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-3.5 py-2 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-xs font-medium text-zinc-300 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onConfirm(checked)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
              destructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {loading ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
