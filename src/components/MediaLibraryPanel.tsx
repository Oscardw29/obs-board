"use client";

import React, { useRef, useState } from "react";
import {
  Film,
  Image as ImageIcon,
  Plus,
  Search,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { uploadMediaFile } from "@/lib/client-media-upload";
import type { BoardElement, MediaAsset } from "@/types/board";

interface MediaLibraryPanelProps {
  assets: MediaAsset[];
  boardElements: BoardElement[];
  canEdit: boolean;
  onAssetUploaded: (asset: MediaAsset) => void;
  onAssetDeleted: (assetId: string) => void;
  onInsertAsset: (
    asset: MediaAsset,
    options: { loop: boolean; autoHideOnEnd: boolean; muted: boolean }
  ) => void;
  onQuickTriggerExisting: (elementId: string) => void;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export const MediaLibraryPanel: React.FC<MediaLibraryPanelProps> = ({
  assets,
  boardElements,
  canEdit,
  onAssetUploaded,
  onAssetDeleted,
  onInsertAsset,
  onQuickTriggerExisting,
}) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default behavior when inserting a clip
  const [defaultLoop, setDefaultLoop] = useState(false);
  const [defaultAutoHide, setDefaultAutoHide] = useState(true);
  const [defaultMuted, setDefaultMuted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadMediaFile(file);
        if (res.error || !res.asset) {
          setError(res.error || `Error subiendo ${file.name}`);
        } else {
          onAssetUploaded(res.asset);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar este clip/imagen de tu biblioteca?")) return;
    const res = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onAssetDeleted(assetId);
    }
  };

  const filtered = assets.filter((a) => {
    if (filter !== "all" && a.kind !== filter) return false;
    if (query.trim() && !a.name.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <aside className="w-72 shrink-0 h-full bg-studio-900/95 border-r border-studio-800 flex flex-col select-none">
      {/* Header */}
      <div className="p-3.5 border-b border-studio-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-fuchsia-400" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
              Biblioteca Media
            </h2>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            {assets.length} guardados
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-md shadow-indigo-600/20"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{uploading ? "Importando..." : "Importar video / imagen"}</span>
        </button>

        {/* Search + Tabs */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clip o imagen..."
            className="w-full rounded-lg bg-studio-950 border border-studio-700 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 bg-studio-950 p-0.5 rounded-lg border border-studio-800 text-[11px]">
          {(
            [
              ["all", "Todos"],
              ["video", "Clips"],
              ["image", "Imágenes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`py-1 rounded-md transition ${
                filter === id
                  ? "bg-studio-800 text-white font-medium"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Clip insert preset toggles */}
        <div className="rounded-lg bg-studio-950/90 border border-studio-800 p-2 space-y-1.5">
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Al insertar un clip:
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDefaultLoop((v) => !v);
                if (!defaultLoop) setDefaultAutoHide(false);
              }}
              className={`px-2 py-0.5 rounded-md text-[10px] border transition ${
                defaultLoop
                  ? "bg-indigo-500/20 border-indigo-400/50 text-indigo-200"
                  : "bg-studio-900 border-studio-700 text-zinc-400"
              }`}
            >
              Loop: {defaultLoop ? "Sí" : "No"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDefaultAutoHide((v) => !v);
                if (!defaultAutoHide) setDefaultLoop(false);
              }}
              className={`px-2 py-0.5 rounded-md text-[10px] border transition ${
                defaultAutoHide
                  ? "bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200"
                  : "bg-studio-900 border-studio-700 text-zinc-400"
              }`}
            >
              Auto-ocultar: {defaultAutoHide ? "Sí" : "No"}
            </button>
            <button
              type="button"
              onClick={() => setDefaultMuted((v) => !v)}
              className={`px-2 py-0.5 rounded-md text-[10px] border transition ${
                !defaultMuted
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                  : "bg-studio-900 border-studio-700 text-zinc-400"
              }`}
            >
              Audio: {defaultMuted ? "Mute" : "On"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">
          {error}
        </div>
      )}

      {/* Assets list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-studio-700 p-5 text-center space-y-2 mt-2">
            <Film className="w-7 h-7 text-zinc-600 mx-auto" />
            <p className="text-xs font-medium text-zinc-300">
              {assets.length === 0
                ? "Sin clips todavía"
                : "Sin resultados para tu búsqueda"}
            </p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Sube archivos MP4, WebM transparente, GIF o PNG. También puedes
              arrastrar archivos directo al lienzo.
            </p>
          </div>
        ) : (
          filtered.map((asset) => {
            const existingOnBoard = boardElements.find(
              (el) => el.type === "video" && el.mediaAssetId === asset.id
            );

            return (
              <div
                key={asset.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/x-obsboard-asset",
                    JSON.stringify({
                      asset,
                      options: {
                        loop: defaultLoop,
                        autoHideOnEnd: defaultAutoHide,
                        muted: defaultMuted,
                      },
                    })
                  );
                }}
                className="group rounded-xl bg-studio-950 border border-studio-800 hover:border-indigo-500/50 overflow-hidden transition"
              >
                <div className="relative aspect-video obs-checkerboard flex items-center justify-center overflow-hidden">
                  {asset.kind === "video" ? (
                    <video
                      src={asset.url}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => {
                        void e.currentTarget.play().catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-contain"
                    />
                  )}

                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] text-zinc-200">
                    {asset.kind === "video" ? (
                      <Film className="w-2.5 h-2.5 text-fuchsia-400" />
                    ) : (
                      <ImageIcon className="w-2.5 h-2.5 text-cyan-400" />
                    )}
                    {asset.kind === "video"
                      ? formatDuration(asset.durationSec) || "Clip"
                      : "Img"}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, asset.id)}
                    title="Eliminar de biblioteca"
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded bg-black/75 text-zinc-400 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="p-2 space-y-1.5">
                  <p
                    className="text-xs font-medium text-zinc-200 truncate"
                    title={asset.name}
                  >
                    {asset.name}
                  </p>

                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      {existingOnBoard && (
                        <button
                          type="button"
                          onClick={() =>
                            onQuickTriggerExisting(existingOnBoard.id)
                          }
                          title="Disparar este clip en vivo desde 0:00"
                          className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[11px] font-semibold transition"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Disparar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onInsertAsset(asset, {
                            loop: defaultLoop,
                            autoHideOnEnd: defaultAutoHide,
                            muted: defaultMuted,
                          })
                        }
                        className={`${
                          existingOnBoard ? "px-2" : "flex-1 px-2"
                        } inline-flex items-center justify-center gap-1 py-1 rounded-lg bg-studio-850 hover:bg-indigo-600 border border-studio-700 hover:border-indigo-500 text-zinc-200 hover:text-white text-[11px] font-medium transition`}
                      >
                        <Plus className="w-3 h-3" />
                        <span>{existingOnBoard ? "Nuevo" : "Añadir al tablero"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
