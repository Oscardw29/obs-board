"use client";

import React, { useRef, useState } from "react";
import {
  Check,
  FileText,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  Type as TypeIcon,
  Upload,
  Zap,
} from "lucide-react";
import { uploadMediaFile } from "@/lib/client-media-upload";
import type { BoardElement, MediaAsset, MediaFolder } from "@/types/board";
import { ConfirmModal } from "./ui/ConfirmModal";
import { CustomColorPicker } from "./ui/CustomColorPicker";

interface MediaLibraryPanelProps {
  boardId: string;
  assets: MediaAsset[];
  folders: MediaFolder[];
  boardElements: BoardElement[];
  canEdit: boolean;
  onAssetUploaded: (asset: MediaAsset) => void;
  onAssetUpdated: (asset: MediaAsset) => void;
  onAssetDeleted: (assetId: string) => void;
  onFolderCreated: (folder: MediaFolder) => void;
  onFolderUpdated: (folder: MediaFolder) => void;
  onFolderDeleted: (folderId: string) => void;
  onInsertAsset: (
    asset: MediaAsset,
    options: { loop: boolean; autoHideOnEnd: boolean; muted: boolean }
  ) => void;
  onApplyFontAsset: (asset: MediaAsset) => void;
  onOpenDocumentModal: () => void;
  onQuickTriggerExisting: (elementId: string) => void;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export const MediaLibraryPanel: React.FC<MediaLibraryPanelProps> = ({
  boardId,
  assets,
  folders,
  boardElements,
  canEdit,
  onAssetUploaded,
  onAssetUpdated,
  onAssetDeleted,
  onFolderCreated,
  onFolderUpdated,
  onFolderDeleted,
  onInsertAsset,
  onApplyFontAsset,
  onOpenDocumentModal,
  onQuickTriggerExisting,
}) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "video" | "image" | "document">("all");
  const [activeFolderId, setActiveFolderId] = useState<string | "all" | "root">("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default behavior when inserting a clip (autoHideOnEnd ON by default!)
  const [defaultLoop, setDefaultLoop] = useState(false);
  const [defaultAutoHide, setDefaultAutoHide] = useState(true);
  const [defaultMuted, setDefaultMuted] = useState(false);

  // Folder creation & editing
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#38bdf8");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [dragOverFolderId, setDragOverFolderId] = useState<string | "root" | null>(null);

  // Asset editing & delete confirmation
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editAssetName, setEditAssetName] = useState("");
  const [colorEditAssetId, setColorEditAssetId] = useState<string | null>(null);
  const [deleteAssetTarget, setDeleteAssetTarget] = useState<MediaAsset | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<MediaFolder | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const targetFolder =
      activeFolderId !== "all" && activeFolderId !== "root"
        ? activeFolderId
        : null;
    try {
      for (const file of Array.from(files)) {
        const res = await uploadMediaFile(file, {
          boardId,
          folderId: targetFolder,
        });
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

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !canEdit) return;
    const res = await fetch("/api/media/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFolderName.trim(),
        color: newFolderColor,
        boardId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      folder?: MediaFolder;
      error?: string;
    };
    if (res.ok && data.folder) {
      onFolderCreated(data.folder);
      setNewFolderName("");
      setNewFolderOpen(false);
      setActiveFolderId(data.folder.id);
    } else {
      setError(data.error || "No se pudo crear la carpeta.");
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editFolderName.trim()) {
      setEditingFolderId(null);
      return;
    }
    const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editFolderName.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { folder?: MediaFolder };
    if (res.ok && data.folder) {
      onFolderUpdated(data.folder);
    }
    setEditingFolderId(null);
  };

  const handleUpdateFolderColor = async (folderId: string, color: string) => {
    const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    const data = (await res.json().catch(() => ({}))) as { folder?: MediaFolder };
    if (res.ok && data.folder) {
      onFolderUpdated(data.folder);
    }
  };

  const handleMoveAssetToFolder = async (
    assetId: string,
    folderId: string | null
  ) => {
    if (!canEdit) return;
    const res = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, boardId }),
    });
    const data = (await res.json().catch(() => ({}))) as { asset?: MediaAsset };
    if (res.ok && data.asset) {
      onAssetUpdated(data.asset);
    }
  };

  const handleRenameAsset = async (assetId: string) => {
    if (!editAssetName.trim()) {
      setEditingAssetId(null);
      return;
    }
    const res = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editAssetName.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { asset?: MediaAsset };
    if (res.ok && data.asset) {
      onAssetUpdated(data.asset);
    }
    setEditingAssetId(null);
  };

  const handleAssetColorChange = async (assetId: string, color: string) => {
    const res = await fetch(`/api/media/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    const data = (await res.json().catch(() => ({}))) as { asset?: MediaAsset };
    if (res.ok && data.asset) {
      onAssetUpdated(data.asset);
    }
  };

  const handleConfirmDeleteAsset = async () => {
    if (!deleteAssetTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/media/${encodeURIComponent(deleteAssetTarget.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onAssetDeleted(deleteAssetTarget.id);
      }
    } finally {
      setDeleting(false);
      setDeleteAssetTarget(null);
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/media/folders/${encodeURIComponent(deleteFolderTarget.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onFolderDeleted(deleteFolderTarget.id);
        if (activeFolderId === deleteFolderTarget.id) {
          setActiveFolderId("all");
        }
      }
    } finally {
      setDeleting(false);
      setDeleteFolderTarget(null);
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

  const activeFolderObj =
    activeFolderId !== "all" && activeFolderId !== "root"
      ? folders.find((f) => f.id === activeFolderId) ?? null
      : null;

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 select-none animate-panel-enter">
        {/* Header actions */}
        <div className="p-3 border-b border-white/[0.07] space-y-2.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/gif,.ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={uploading || !canEdit}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 px-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-sky-600/20"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? "Subiendo…" : "Importar media"}</span>
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={onOpenDocumentModal}
              title="Adjuntar documento PDF / TXT / MD"
              className="px-2.5 py-2 rounded-xl bg-studio-950 hover:bg-studio-800 border border-white/[0.09] disabled:opacity-45 text-amber-300 text-[11px] font-medium flex items-center gap-1 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Doc</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en biblioteca compartida…"
              className="w-full rounded-xl bg-studio-950 border border-white/[0.08] pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400"
            />
          </div>

          {/* Kind filter tabs */}
          <div className="grid grid-cols-4 gap-1 bg-studio-950 p-0.5 rounded-lg border border-white/[0.07] text-[10px]">
            {(
              [
                ["all", "Todo"],
                ["video", "Clips"],
                ["image", "Img"],
                ["document", "Docs"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`py-1 rounded-md transition-colors ${
                  filter === id
                    ? "bg-studio-800 text-white font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Shared Folders bar (drag assets onto any folder to organize) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Carpetas compartidas
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setNewFolderOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>Nueva</span>
                </button>
              )}
            </div>

            {newFolderOpen && (
              <form
                onSubmit={handleCreateFolder}
                className="rounded-xl bg-studio-950 border border-sky-400/35 p-2 space-y-2 animate-panel-enter"
              >
                <input
                  autoFocus
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nombre de carpeta…"
                  className="w-full rounded-lg bg-studio-900 border border-white/[0.08] px-2 py-1 text-xs text-white placeholder:text-zinc-500 focus:border-sky-400 outline-none"
                />
                <CustomColorPicker
                  compact
                  value={newFolderColor}
                  onChange={setNewFolderColor}
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewFolderOpen(false)}
                    className="px-2 py-1 rounded-md text-[10px] text-zinc-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!newFolderName.trim()}
                    className="px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold disabled:opacity-45"
                  >
                    Crear
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setActiveFolderId("all")}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                  activeFolderId === "all"
                    ? "bg-sky-500/20 border-sky-400/50 text-sky-200"
                    : "bg-studio-950 border-white/[0.07] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Todas ({assets.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveFolderId("root")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverFolderId("root");
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverFolderId(null);
                  const aid = e.dataTransfer.getData("application/x-oboards-move-asset");
                  if (aid) void handleMoveAssetToFolder(aid, null);
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                  dragOverFolderId === "root"
                    ? "bg-sky-500/30 border-sky-400 text-white scale-105"
                    : activeFolderId === "root"
                      ? "bg-sky-500/20 border-sky-400/50 text-sky-200"
                      : "bg-studio-950 border-white/[0.07] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Sin carpeta
              </button>

              {folders.map((folder) => {
                const isActive = activeFolderId === folder.id;
                const isDragOver = dragOverFolderId === folder.id;
                const count = assets.filter((a) => a.folderId === folder.id).length;

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setActiveFolderId(folder.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverFolderId(null);
                      const aid = e.dataTransfer.getData("application/x-oboards-move-asset");
                      if (aid) void handleMoveAssetToFolder(aid, folder.id);
                    }}
                    title="Clic para abrir · Suelta un archivo aquí para moverlo"
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-[transform,colors] ${
                      isDragOver
                        ? "border-sky-400 bg-sky-500/25 text-white scale-105"
                        : isActive
                          ? "bg-studio-800 border-white/25 text-white"
                          : "bg-studio-950 border-white/[0.07] text-zinc-300 hover:border-white/20"
                    }`}
                  >
                    {isActive ? (
                      <FolderOpen
                        className="w-3 h-3 shrink-0"
                        style={{ color: folder.color }}
                      />
                    ) : (
                      <Folder
                        className="w-3 h-3 shrink-0"
                        style={{ color: folder.color }}
                      />
                    )}
                    <span className="truncate max-w-[82px]">{folder.name}</span>
                    <span className="text-zinc-500 font-mono">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Folder Quick Controls (Rename, Color, Delete) */}
            {activeFolderObj && canEdit && (
              <div className="rounded-lg bg-studio-950/90 border border-white/[0.08] p-2 space-y-2">
                <div className="flex items-center justify-between gap-1.5">
                  {editingFolderId === activeFolderObj.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        autoFocus
                        value={editFolderName}
                        onChange={(e) => setEditFolderName(e.target.value)}
                        onBlur={() => handleRenameFolder(activeFolderObj.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void handleRenameFolder(activeFolderObj.id);
                          }
                          if (e.key === "Escape") setEditingFolderId(null);
                        }}
                        className="flex-1 rounded bg-studio-900 border border-sky-400 px-1.5 py-0.5 text-[11px] text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameFolder(activeFolderObj.id)}
                        className="p-1 text-emerald-400"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: activeFolderObj.color }}
                      />
                      <span className="text-[11px] font-semibold text-zinc-200 truncate">
                        {activeFolderObj.name}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFolderId(activeFolderObj.id);
                        setEditFolderName(activeFolderObj.name);
                      }}
                      title="Renombrar carpeta"
                      aria-label="Renombrar carpeta"
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-studio-800"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteFolderTarget(activeFolderObj)}
                      title="Eliminar carpeta (conserva archivos)"
                      aria-label="Eliminar carpeta"
                      className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <CustomColorPicker
                  compact
                  value={activeFolderObj.color}
                  onChange={(c) => void handleUpdateFolderColor(activeFolderObj.id, c)}
                />
              </div>
            )}
          </div>

          {/* Clip insert preset toggles */}
          <div className="rounded-xl bg-studio-950/90 border border-white/[0.07] p-2 space-y-1.5">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Al insertar un clip:
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = !defaultAutoHide;
                  setDefaultAutoHide(next);
                  if (next) setDefaultLoop(false);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${
                  defaultAutoHide
                    ? "bg-sky-500/20 border-sky-400/50 text-sky-200"
                    : "bg-studio-900 border-white/[0.08] text-zinc-400"
                }`}
              >
                Auto-ocultar: {defaultAutoHide ? "Sí" : "No"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !defaultLoop;
                  setDefaultLoop(next);
                  if (next) setDefaultAutoHide(false);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${
                  defaultLoop
                    ? "bg-sky-500/20 border-sky-400/50 text-sky-200"
                    : "bg-studio-900 border-white/[0.08] text-zinc-400"
                }`}
              >
                Loop: {defaultLoop ? "Sí" : "No"}
              </button>
              <button
                type="button"
                onClick={() => setDefaultMuted((v) => !v)}
                className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${
                  !defaultMuted
                    ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                    : "bg-studio-900 border-white/[0.08] text-zinc-400"
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
            <div className="rounded-xl border border-dashed border-white/[0.12] p-5 text-center space-y-2 mt-2">
              <Film className="w-7 h-7 text-zinc-600 mx-auto" />
              <p className="text-xs font-medium text-zinc-300">
                {assets.length === 0
                  ? "Biblioteca compartida vacía"
                  : "Sin archivos aquí"}
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Sube videos, imágenes, fuentes o documentos. Arrastra archivos
                sobre las carpetas para organizarlos o al lienzo para insertarlos.
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
                      "application/x-oboards-move-asset",
                      asset.id
                    );
                    if (asset.kind !== "font") {
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
                    }
                  }}
                  style={
                    asset.color
                      ? { borderLeftWidth: 3, borderLeftColor: asset.color }
                      : undefined
                  }
                  className="group rounded-xl bg-studio-950 border border-white/[0.08] hover:border-sky-400/50 overflow-hidden transition-colors"
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
                    ) : asset.kind === "font" ? (
                      <div className="flex flex-col items-center gap-1 text-sky-300">
                        <TypeIcon className="w-6 h-6" />
                        <span className="text-[10px] font-mono">
                          Fuente importada
                        </span>
                      </div>
                    ) : (
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-contain"
                      />
                    )}

                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] text-zinc-200">
                      {asset.kind === "video" ? (
                        <Film className="w-2.5 h-2.5 text-sky-400" />
                      ) : asset.kind === "document" ? (
                        <FileText className="w-2.5 h-2.5 text-amber-400" />
                      ) : asset.kind === "font" ? (
                        <TypeIcon className="w-2.5 h-2.5 text-emerald-400" />
                      ) : (
                        <ImageIcon className="w-2.5 h-2.5 text-cyan-400" />
                      )}
                      {asset.kind === "video"
                        ? formatDuration(asset.durationSec) || "Clip"
                        : asset.kind === "document"
                          ? `${asset.metadata?.documentPages?.length ?? 1} pág.`
                          : asset.kind === "font"
                            ? "Font"
                            : "Img"}
                    </span>

                    {canEdit && (
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button
                          type="button"
                          onClick={() =>
                            setColorEditAssetId((curr) =>
                              curr === asset.id ? null : asset.id
                            )
                          }
                          title="Color de etiqueta"
                          aria-label="Color de etiqueta"
                          className="p-1 rounded bg-black/75 text-zinc-300 hover:text-white"
                        >
                          <span
                            className="block w-3 h-3 rounded-full border border-white/40"
                            style={{ backgroundColor: asset.color || "#38bdf8" }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAssetId(asset.id);
                            setEditAssetName(asset.name);
                          }}
                          title="Renombrar archivo"
                          aria-label="Renombrar archivo"
                          className="p-1 rounded bg-black/75 text-zinc-300 hover:text-white"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteAssetTarget(asset)}
                          title="Eliminar de biblioteca"
                          aria-label="Eliminar de biblioteca"
                          className="p-1 rounded bg-black/75 text-zinc-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-2 space-y-1.5">
                    {colorEditAssetId === asset.id && canEdit && (
                      <div className="pb-1">
                        <CustomColorPicker
                          compact
                          value={asset.color || "#38bdf8"}
                          onChange={(c) => void handleAssetColorChange(asset.id, c)}
                        />
                      </div>
                    )}

                    {editingAssetId === asset.id ? (
                      <input
                        autoFocus
                        value={editAssetName}
                        onChange={(e) => setEditAssetName(e.target.value)}
                        onBlur={() => handleRenameAsset(asset.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRenameAsset(asset.id);
                          if (e.key === "Escape") setEditingAssetId(null);
                        }}
                        className="w-full rounded bg-studio-900 border border-sky-400 px-1.5 py-0.5 text-xs text-white outline-none"
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className="text-xs font-medium text-zinc-200 truncate"
                          title={asset.name}
                        >
                          {asset.name}
                        </p>
                        {asset.uploadedByName && (
                          <span className="text-[9px] text-zinc-500 shrink-0 truncate max-w-[70px]">
                            ({asset.uploadedByName})
                          </span>
                        )}
                      </div>
                    )}

                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        {existingOnBoard && (
                          <button
                            type="button"
                            onClick={() =>
                              onQuickTriggerExisting(existingOnBoard.id)
                            }
                            title="Disparar este clip en vivo desde 0:00"
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-colors"
                          >
                            <Zap className="w-3 h-3" />
                            <span>Disparar</span>
                          </button>
                        )}
                        {asset.kind === "font" ? (
                          <button
                            type="button"
                            onClick={() => onApplyFontAsset(asset)}
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-studio-850 hover:bg-sky-600 border border-white/[0.08] text-zinc-200 hover:text-white text-[11px] font-medium transition-colors"
                          >
                            <TypeIcon className="w-3 h-3" />
                            <span>Usar fuente</span>
                          </button>
                        ) : (
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
                            } inline-flex items-center justify-center gap-1 py-1 rounded-lg bg-studio-850 hover:bg-sky-600 border border-white/[0.08] hover:border-sky-500 text-zinc-200 hover:text-white text-[11px] font-medium transition-colors`}
                          >
                            <Plus className="w-3 h-3" />
                            <span>
                              {existingOnBoard ? "Nuevo" : "Añadir al tablero"}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteAssetTarget)}
        title="¿Eliminar archivo de la biblioteca?"
        description={`Se eliminará "${deleteAssetTarget?.name ?? ""}" de la biblioteca compartida.`}
        confirmLabel="Eliminar archivo"
        destructive
        loading={deleting}
        onCancel={() => setDeleteAssetTarget(null)}
        onConfirm={handleConfirmDeleteAsset}
      />

      <ConfirmModal
        open={Boolean(deleteFolderTarget)}
        title={`¿Eliminar carpeta "${deleteFolderTarget?.name ?? ""}"?`}
        description="Los archivos dentro de esta carpeta no se borrarán; pasarán a 'Sin carpeta'."
        confirmLabel="Eliminar carpeta"
        destructive
        loading={deleting}
        onCancel={() => setDeleteFolderTarget(null)}
        onConfirm={handleConfirmDeleteFolder}
      />
    </>
  );
};
