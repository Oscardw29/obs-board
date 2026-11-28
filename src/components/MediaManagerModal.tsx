"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  FileText,
  Film,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  Search,
  Trash2,
  Type as TypeIcon,
  Upload,
  X,
} from "lucide-react";
import { uploadMediaFile } from "@/lib/client-media-upload";
import type { MediaAsset, MediaFolder } from "@/types/board";
import { buildOscilloscopePath } from "./AudioElementNode";
import { ConfirmModal } from "./ui/ConfirmModal";
import { CustomColorPicker } from "./ui/CustomColorPicker";

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

export const MediaManagerModal: React.FC<MediaManagerModalProps> = ({
  open,
  onClose,
  onAssetsCountChange,
}) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | "all" | "root">("all");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "all" | "video" | "audio" | "image" | "document"
  >("all");
  const [fileDragOver, setFileDragOver] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#38bdf8");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/media");
      const data = (await res.json()) as {
        assets?: MediaAsset[];
        folders?: MediaFolder[];
      };
      if (data.assets) {
        setAssets(data.assets);
        onAssetsCountChange?.(data.assets.length);
      }
      if (data.folders) {
        setFolders(data.folders);
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

  const handleUploadFiles = async (
    files: FileList | null,
    overrideFolderId?: string | null
  ) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded: MediaAsset[] = [];
      const targetFolder =
        overrideFolderId !== undefined
          ? overrideFolderId
          : activeFolderId !== "all" && activeFolderId !== "root"
            ? activeFolderId
            : null;
      for (const file of Array.from(files)) {
        const res = await uploadMediaFile(file, { folderId: targetFolder });
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

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/media/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          color: newFolderColor,
        }),
      });
      const data = (await res.json()) as { folder?: MediaFolder };
      if (res.ok && data.folder) {
        setFolders((prev) => [...prev, data.folder!]);
        setNewFolderName("");
      }
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleMoveAssetToFolder = async (
    assetId: string,
    folderId: string | null
  ) => {
    const res = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    if (res.ok) {
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, folderId } : a))
      );
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

  const confirmDeleteAsset = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/media/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        const next = assets.filter((a) => a.id !== deleteTarget.id);
        setAssets(next);
        onAssetsCountChange?.(next.length);
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filtered = assets.filter((a) => {
    if (filter !== "all" && a.kind !== filter) return false;
    if (activeFolderId === "root" && a.folderId) return false;
    if (
      activeFolderId !== "all" &&
      activeFolderId !== "root" &&
      a.folderId !== activeFolderId
    ) {
      return false;
    }
    if (query.trim() && !a.name.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overscroll-contain"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`w-full max-w-5xl rounded-2xl bg-studio-900 border shadow-2xl overflow-hidden flex flex-col max-h-[86vh] animate-modal-enter transition-colors ${
            fileDragOver
              ? "border-sky-400 ring-2 ring-sky-400/40"
              : "border-white/[0.1]"
          }`}
          onClick={(e) => e.stopPropagation()}
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes("Files") &&
              !e.dataTransfer.types.includes("application/x-oboards-move-asset")
            ) {
              e.preventDefault();
              setFileDragOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setFileDragOver(false);
            }
          }}
          onDrop={(e) => {
            setFileDragOver(false);
            if (
              e.dataTransfer.files &&
              e.dataTransfer.files.length > 0 &&
              !e.dataTransfer.getData("application/x-oboards-move-asset")
            ) {
              e.preventDefault();
              void handleUploadFiles(e.dataTransfer.files);
            }
          }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
            <div>
              <h2 className="text-base font-semibold text-white">
                Biblioteca de Clips, Audios, Imágenes y Carpetas
              </h2>
              <p className="text-xs text-zinc-400">
                Arrastra archivos desde tu computadora directamente aquí para
                importarlos, o organízalos en carpetas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,image/png,image/jpeg,image/webp,image/gif,.ttf,.otf,.woff,.woff2"
                className="hidden"
                onChange={(e) => handleUploadFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? "Subiendo…" : "Importar archivo"}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar biblioteca"
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filters & Folder creator */}
          <div className="px-6 py-3 border-b border-white/[0.07] flex flex-wrap items-center gap-3 bg-studio-950/50">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar archivo…"
                className="w-full rounded-xl bg-studio-950 border border-white/[0.09] pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400"
              />
            </div>
            <div className="flex rounded-xl bg-studio-950 border border-white/[0.08] p-0.5 text-xs">
              {(
                [
                  ["all", "Todos"],
                  ["video", "Videos"],
                  ["audio", "Audios"],
                  ["image", "Imágenes"],
                  ["document", "Docs"],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    filter === k
                      ? "bg-studio-800 text-white font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex flex-1 min-h-0">
            {/* Folder sidebar */}
            <div className="w-56 shrink-0 border-r border-white/[0.07] p-3 space-y-3 overflow-y-auto bg-studio-950/35">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveFolderId("all")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    activeFolderId === "all"
                      ? "bg-sky-500/20 text-sky-200 font-medium"
                      : "text-zinc-300 hover:bg-studio-850"
                  }`}
                >
                  <span>Todos los archivos</span>
                  <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                    {assets.length}
                  </span>
                </button>
                <button
                  type="button"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const aid = e.dataTransfer.getData("application/x-oboards-move-asset");
                    if (aid) void handleMoveAssetToFolder(aid, null);
                  }}
                  onClick={() => setActiveFolderId("root")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    activeFolderId === "root"
                      ? "bg-sky-500/20 text-sky-200 font-medium"
                      : "text-zinc-400 hover:bg-studio-850"
                  }`}
                >
                  <span>Sin carpeta</span>
                  <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                    {assets.filter((a) => !a.folderId).length}
                  </span>
                </button>
              </div>

              <div className="space-y-1 pt-2 border-t border-white/[0.06]">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold px-1">
                  Carpetas (suelta aquí)
                </p>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setFileDragOver(false);
                      const aid = e.dataTransfer.getData("application/x-oboards-move-asset");
                      if (aid) {
                        void handleMoveAssetToFolder(aid, folder.id);
                      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        void handleUploadFiles(e.dataTransfer.files, folder.id);
                      }
                    }}
                    onClick={() => setActiveFolderId(folder.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      activeFolderId === folder.id
                        ? "bg-studio-800 text-white font-medium border border-white/[0.1]"
                        : "text-zinc-300 hover:bg-studio-850"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Folder
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: folder.color }}
                      />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                      {assets.filter((a) => a.folderId === folder.id).length}
                    </span>
                  </button>
                ))}
              </div>

              <form
                onSubmit={handleCreateFolder}
                className="pt-2 border-t border-white/[0.06] space-y-2"
              >
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nueva carpeta…"
                  className="w-full rounded-lg bg-studio-950 border border-white/[0.09] px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-sky-400 outline-none"
                />
                <CustomColorPicker
                  compact
                  value={newFolderColor}
                  onChange={setNewFolderColor}
                />
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="w-full py-1.5 rounded-lg bg-studio-850 hover:bg-sky-600 border border-white/[0.08] text-xs text-zinc-200 hover:text-white inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-45"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Crear carpeta</span>
                </button>
              </form>
            </div>

            {/* Grid */}
            <div className="p-6 overflow-y-auto flex-1 overscroll-contain">
              {loading ? (
                <div className="py-16 text-center text-sm text-zinc-500">
                  Cargando biblioteca…
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center space-y-3 border border-dashed border-white/[0.12] rounded-2xl">
                  <Film className="w-9 h-9 text-zinc-600 mx-auto" />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">
                      Sin archivos en esta vista
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Importa clips MP4, WebM transparentes, imágenes o documentos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Subir archivo</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {filtered.map((asset) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-oboards-move-asset", asset.id);
                      }}
                      className="group rounded-xl bg-studio-950 border border-white/[0.08] hover:border-sky-400/50 overflow-hidden flex flex-col transition-colors cursor-grab"
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
                        ) : asset.kind === "audio" ? (
                          <div className="w-full h-full bg-black flex items-center justify-center p-3">
                            {asset.metadata?.waveformPeaks?.length ? (
                              <svg
                                viewBox="0 0 300 70"
                                preserveAspectRatio="none"
                                className="w-full h-full"
                              >
                                <path
                                  d={buildOscilloscopePath(
                                    asset.metadata.waveformPeaks,
                                    300,
                                    70
                                  )}
                                  fill="none"
                                  stroke="#fb923c"
                                  strokeWidth={2.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-orange-400">
                                <AudioLines className="w-7 h-7" />
                                <span className="text-[11px] font-mono">Audio</span>
                              </div>
                            )}
                          </div>
                        ) : asset.kind === "font" ? (
                          <div className="flex flex-col items-center gap-1 text-sky-300">
                            <TypeIcon className="w-7 h-7" />
                            <span className="text-[11px] font-mono">Fuente</span>
                          </div>
                        ) : (
                          <img
                            src={asset.url}
                            alt={asset.name}
                            className="w-full h-full object-contain"
                          />
                        )}
                        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-medium text-zinc-200">
                          {asset.kind === "video" ? (
                            <Film className="w-2.5 h-2.5 text-sky-400" />
                          ) : asset.kind === "audio" ? (
                            <AudioLines className="w-2.5 h-2.5 text-orange-400" />
                          ) : asset.kind === "document" ? (
                            <FileText className="w-2.5 h-2.5 text-amber-400" />
                          ) : asset.kind === "font" ? (
                            <TypeIcon className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <ImageIcon className="w-2.5 h-2.5 text-cyan-400" />
                          )}
                          {asset.kind === "video"
                            ? formatDuration(asset.durationSec) || "Video"
                            : asset.kind === "audio"
                              ? formatDuration(asset.durationSec) || "Audio"
                              : asset.kind === "document"
                                ? `${asset.metadata?.documentPages?.length ?? 1} pág.`
                                : asset.kind === "font"
                                  ? "Fuente"
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
                              className="w-full bg-studio-900 border border-sky-400 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                            />
                          ) : (
                            <p
                              className="text-xs font-medium text-zinc-200 truncate"
                              title={asset.name}
                            >
                              {asset.name}
                            </p>
                          )}
                          <p className="text-[10px] text-zinc-500 font-mono tabular-nums">
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
                            aria-label="Renombrar archivo"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(asset)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                            title="Eliminar"
                            aria-label="Eliminar archivo"
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
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="¿Eliminar archivo de la biblioteca?"
        description={`Se eliminará "${deleteTarget?.name ?? ""}" de la biblioteca compartida.`}
        confirmLabel="Eliminar archivo"
        destructive
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteAsset}
      />
    </>
  );
};
