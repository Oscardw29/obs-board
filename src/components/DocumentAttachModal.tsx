"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, FileText, Layers, Loader2, Upload, X } from "lucide-react";
import {
  registerDocumentAsset,
  uploadRenderedPageBlob,
} from "@/lib/client-media-upload";
import {
  loadDocumentForAttachment,
  type LoadedDocumentHandle,
} from "@/lib/document-renderer";
import type { DocumentPage, MediaAsset } from "@/types/board";

interface DocumentAttachModalProps {
  open: boolean;
  boardId: string;
  initialFile?: File | null;
  onClose: () => void;
  onDocumentInserted: (
    mode: "single" | "separate",
    title: string,
    pages: DocumentPage[],
    asset?: MediaAsset
  ) => void;
}

interface PagePreview {
  pageNumber: number;
  thumbUrl: string;
  width: number;
  height: number;
}

export const DocumentAttachModal: React.FC<DocumentAttachModalProps> = ({
  open,
  boardId,
  initialFile,
  onClose,
  onDocumentInserted,
}) => {
  const [docHandle, setDocHandle] = useState<LoadedDocumentHandle | null>(null);
  const [previews, setPreviews] = useState<PagePreview[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState("");
  const [insertMode, setInsertMode] = useState<"single" | "separate">("single");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFile = async (file: File) => {
    setError(null);
    setLoadingDoc(true);
    setPreviews([]);
    setSelectedPages(new Set());
    docHandle?.dispose();
    setDocHandle(null);

    try {
      const handle = await loadDocumentForAttachment(file);
      setDocHandle(handle);
      const rendered: PagePreview[] = [];
      const defaultSelected = new Set<number>();

      // Load thumbnails for pages (up to 40 cleanly)
      const count = Math.min(handle.pageCount, 40);
      for (let p = 1; p <= count; p++) {
        const res = await handle.renderPageToDataUrl(p, 0.35);
        rendered.push({
          pageNumber: p,
          thumbUrl: res.dataUrl,
          width: res.width,
          height: res.height,
        });
        defaultSelected.add(p);
      }
      setPreviews(rendered);
      setSelectedPages(defaultSelected);
      setRangeInput(count === 1 ? "1" : `1-${count}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo abrir el documento seleccionado."
      );
    } finally {
      setLoadingDoc(false);
    }
  };

  useEffect(() => {
    if (open && initialFile) {
      void loadFile(initialFile);
    }
    if (!open) {
      docHandle?.dispose();
      setDocHandle(null);
      setPreviews([]);
      setSelectedPages(new Set());
      setError(null);
      setProgressText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  if (!open) return null;

  const togglePage = (p: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const applyRange = (val: string) => {
    setRangeInput(val);
    if (!docHandle) return;
    const next = new Set<number>();
    const parts = val.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
      if (rangeMatch) {
        const a = Math.max(1, parseInt(rangeMatch[1], 10));
        const b = Math.min(docHandle.pageCount, parseInt(rangeMatch[2], 10));
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
          next.add(i);
        }
      } else if (/^\d+$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        if (n >= 1 && n <= docHandle.pageCount) next.add(n);
      }
    }
    if (next.size > 0) setSelectedPages(next);
  };

  const handleAttach = async () => {
    if (!docHandle || selectedPages.size === 0) return;
    setUploading(true);
    setError(null);

    try {
      const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
      const uploadedPages: DocumentPage[] = [];

      for (let i = 0; i < sortedPages.length; i++) {
        const pageNum = sortedPages[i];
        setProgressText(
          `Renderizando y subiendo página ${i + 1} de ${sortedPages.length}…`
        );
        const { blob, width, height } = await docHandle.renderPageToBlob(
          pageNum,
          1.7
        );
        const up = await uploadRenderedPageBlob(
          blob,
          `${docHandle.title}-p${pageNum}.png`,
          { width, height }
        );
        if (up.error || !up.url) {
          throw new Error(up.error || `Error subiendo página ${pageNum}`);
        }
        uploadedPages.push({
          pageNumber: pageNum,
          url: up.url,
          width,
          height,
        });
      }

      setProgressText("Registrando en la biblioteca compartida…");
      const reg = await registerDocumentAsset({
        title: docHandle.title,
        pages: uploadedPages,
        boardId,
      });

      onDocumentInserted(insertMode, docHandle.title, uploadedPages, reg.asset);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error adjuntando el documento."
      );
    } finally {
      setUploading(false);
      setProgressText("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overscroll-contain"
      onClick={() => !uploading && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl bg-studio-900 border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-modal-enter"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Adjuntar documento y seleccionar páginas
              </h2>
              <p className="text-[11px] text-zinc-400">
                Compatible con PDF (.pdf), Texto (.txt) y Markdown (.md).
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFile(f);
            e.target.value = "";
          }}
        />

        <div className="p-5 overflow-y-auto flex-1 space-y-4 overscroll-contain">
          {!docHandle && !loadingDoc && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-14 rounded-2xl border-2 border-dashed border-white/[0.12] hover:border-sky-400/60 bg-studio-950/60 flex flex-col items-center justify-center gap-2.5 transition-colors"
            >
              <Upload className="w-8 h-8 text-sky-400" />
              <span className="text-sm font-semibold text-zinc-100">
                Elegir documento PDF, TXT o MD
              </span>
              <span className="text-xs text-zinc-500">
                Podrás previsualizar y elegir exactamente qué páginas insertar
              </span>
            </button>
          )}

          {loadingDoc && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
              <span className="text-xs">Procesando páginas del documento…</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          {docHandle && !loadingDoc && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-studio-950 border border-white/[0.08] p-3">
                <div>
                  <p className="text-xs font-semibold text-white">
                    {docHandle.title}
                  </p>
                  <p className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    {docHandle.pageCount} páginas · {selectedPages.size} seleccionadas
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => applyRange(e.target.value)}
                    placeholder="Ej. 1-3, 5"
                    aria-label="Rango de páginas"
                    className="w-28 rounded-lg bg-studio-900 border border-white/[0.09] px-2.5 py-1 text-xs font-mono text-white focus:border-sky-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPages(
                        new Set(previews.map((p) => p.pageNumber))
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-[11px] text-zinc-200"
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPages(new Set())}
                    className="px-2.5 py-1 rounded-lg bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-[11px] text-zinc-400"
                  >
                    Ninguna
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-[11px] text-sky-300"
                  >
                    Cambiar archivo
                  </button>
                </div>
              </div>

              {/* Page Thumbnails Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {previews.map((pg) => {
                  const selected = selectedPages.has(pg.pageNumber);
                  return (
                    <button
                      key={pg.pageNumber}
                      type="button"
                      onClick={() => togglePage(pg.pageNumber)}
                      className={`group relative rounded-xl overflow-hidden border-2 transition-[border-color,opacity] text-left ${
                        selected
                          ? "border-sky-400 ring-2 ring-sky-500/35"
                          : "border-white/[0.08] opacity-55 hover:opacity-90"
                      }`}
                    >
                      <div className="aspect-[3/4] bg-white overflow-hidden">
                        <img
                          src={pg.thumbUrl}
                          alt={`Página ${pg.pageNumber}`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="px-2 py-1 bg-studio-950 flex items-center justify-between text-[10px]">
                        <span className="font-mono text-zinc-300">
                          Pág. {pg.pageNumber}
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            selected
                              ? "bg-sky-500 text-white"
                              : "bg-studio-800 text-transparent"
                          }`}
                        >
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Insertion Mode */}
              <div className="grid sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setInsertMode("single")}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    insertMode === "single"
                      ? "bg-sky-500/15 border-sky-400 text-white"
                      : "bg-studio-950 border-white/[0.08] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <FileText className="w-4 h-4 text-sky-400" />
                    <span>Documento navegable (Recomendado)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Inserta una sola capa donde cambias de página en vivo desde
                    el panel Estilo.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setInsertMode("separate")}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    insertMode === "separate"
                      ? "bg-sky-500/15 border-sky-400 text-white"
                      : "bg-studio-950 border-white/[0.08] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Páginas separadas</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Inserta cada página elegida como una capa de imagen
                    independiente en el tablero.
                  </p>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.08] bg-studio-950/60 flex items-center justify-between gap-3">
          <span className="text-xs text-sky-300 font-medium truncate">
            {progressText}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={uploading}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-xs text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!docHandle || selectedPages.size === 0 || uploading}
              onClick={handleAttach}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {uploading
                  ? "Insertando…"
                  : `Insertar ${selectedPages.size} página(s)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
