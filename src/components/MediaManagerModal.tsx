"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Film,
  Image as ImageIcon,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { uploadMediaFile } from "@/lib/client-media-upload";
import type { MediaAsset } from "@/types/board";

interface MediaManagerModalProps {
  open: boolean;
  onClose: () => void;
  onAssetsCountChange?: (count: number) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export async function probeMediaDimensions(file: File): Promise<{
  width?: number;
  height?: number;
  durationSec?: number;
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("video/") || /\.(mp4|webm|mov|ogv)$/i.test(file.name)) {
      return await new Promise((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          resolve({
            width: video.videoWidth || undefined,
            height: video.videoHeight || undefined,
            durationSec: Number.isFinite(video.duration)
              ? Number(video.duration.toFixed(1))
              : undefined,
          });
        };
        video.onerror = () => resolve({});
        video.src = objectUrl;
      });
    }
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || undefined,
          height: img.naturalHeight || undefined,
        });
      };
      img.onerror = () => resolve({});
      img.src = objectUrl;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export const MediaManagerModal: React.FC<MediaManagerModalProps> = ({
  open,
  onClose,
  onAssetsCountChange,
}) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/media");
      const data = (await res.json()) as { assets?: MediaAsset[] };
      if (data.assets) {
        setAssets(data.assets);
        onAssetsCountChange?.(data.assets.length);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setError(null);
      void loadAssets();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded: MediaAsset[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadMediaFile(file);
        if (res.error || !res.asset) {
          setError(res.error || `Error subiendo ${file.name}`);
        } else {
          uploaded.push(res.asset);
        }
      }
      if (uploaded.length > 0) {
        const next = [...uploaded.reverse(), ...assets];
        setAssets(next);
        onAssetsCountChange?.(next.length);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRename = async (assetId: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    const res = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) {
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, name: editName.trim() } : a))
      );
    }
    setEditingId(null);
  };

  const handleDelete = async (assetId: string) => {
    if (!window.confirm("¿Eliminar este archivo de tu biblioteca?")) return;
    const res = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const next = assets.filter((a) => a.id !== assetId);
      setAssets(next);
      onAssetsCountChange?.(next.length);
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-studio-900 border border-studio-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-800">
          <div>
            <h2 className="text-base font-semibold text-white">
              Biblioteca de Clips e Imágenes
            </h2>
            <p className="text-xs text-zinc-400">
              Guarda tus videos MP4/WebM e imágenes una vez y úsalos al instante en
              cualquier tablero.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? "Subiendo..." : "Importar media"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-studio-800/80 flex flex-wrap items-center gap-3 bg-studio-950/40">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar clip o imagen..."
              className="w-full rounded-lg bg-studio-950 border border-studio-700 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex rounded-lg bg-studio-950 border border-studio-800 p-0.5 text-xs">
            {(["all", "video", "image"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`px-3 py-1 rounded-md transition ${
                  filter === k
                    ? "bg-studio-800 text-white font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {k === "all" ? "Todos" : k === "video" ? "Videos" : "Imágenes"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Grid */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              Cargando biblioteca...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center space-y-3 border border-dashed border-studio-700 rounded-2xl">
              <Film className="w-9 h-9 text-zinc-600 mx-auto" />
              <div>
                <p className="text-sm font-medium text-zinc-300">
                  Tu biblioteca está vacía
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Importa clips MP4, WebM con fondo transparente, GIFs o PNGs para
                  tenerlos siempre listos en directo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Subir primer archivo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filtered.map((asset) => (
                <div
                  key={asset.id}
                  className="group rounded-xl bg-studio-950 border border-studio-800 hover:border-studio-600 overflow-hidden flex flex-col transition"
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
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-medium text-zinc-200">
                      {asset.kind === "video" ? (
                        <Film className="w-2.5 h-2.5 text-fuchsia-400" />
                      ) : (
                        <ImageIcon className="w-2.5 h-2.5 text-cyan-400" />
                      )}
                      {asset.kind === "video"
                        ? formatDuration(asset.durationSec) || "Video"
                        : "Img"}
                    </span>
                  </div>

                  <div className="p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {editingId === asset.id ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => handleRename(asset.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(asset.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full bg-studio-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                        />
                      ) : (
                        <p
                          className="text-xs font-medium text-zinc-200 truncate"
                          title={asset.name}
                        >
                          {asset.name}
                        </p>
                      )}
                      <p className="text-[10px] text-zinc-500">
                        {formatBytes(asset.sizeBytes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(asset.id);
                          setEditName(asset.name);
                        }}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-studio-800"
                        title="Renombrar"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(asset.id)}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
