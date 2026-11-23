"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  CopyPlus,
  Film,
  Layers,
  LogOut,
  MonitorPlay,
  Plus,
  Radio,
  Search,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardSummary,
  type User,
} from "@/types/board";
import { BrandLogo } from "./BrandLogo";
import { MediaManagerModal } from "./MediaManagerModal";
import { ShareModal } from "./ShareModal";
import { StageElement } from "./StageElement";
import { ConfirmModal } from "./ui/ConfirmModal";

interface DashboardClientProps {
  user: User;
  mode: "local" | "cloud";
  initialBoards: BoardSummary[];
  initialMediaCount: number;
}

function BoardThumbnail({ board }: { board: BoardSummary }) {
  return (
    <div className="relative w-full aspect-video obs-checkerboard overflow-hidden rounded-t-2xl border-b border-white/[0.07]">
      <div
        className="absolute top-0 left-0 origin-top-left pointer-events-none"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: "scale(0.18)",
        }}
      >
        {board.previewElements.map((el) => (
          <StageElement key={el.id} element={el} mode="thumbnail" />
        ))}
      </div>
      {board.previewElements.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500/70 gap-1">
          <Layers className="w-6 h-6" />
          <span className="text-[11px]">Tablero vacío · 1920×1080</span>
        </div>
      )}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-md border ${
            board.myRole === "owner"
              ? "bg-sky-500/20 text-sky-200 border-sky-400/35"
              : board.myRole === "editor"
                ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/35"
                : "bg-zinc-800/80 text-zinc-300 border-zinc-600/40"
          }`}
        >
          {board.myRole === "owner"
            ? "Propio"
            : board.myRole === "editor"
              ? "Compartido (Editor)"
              : "Compartido (Lectura)"}
        </span>
      </div>
    </div>
  );
}

export const DashboardClient: React.FC<DashboardClientProps> = ({
  user,
  mode,
  initialBoards,
  initialMediaCount,
}) => {
  const [boards, setBoards] = useState<BoardSummary[]>(initialBoards);
  const [mediaCount, setMediaCount] = useState(initialMediaCount);
  const [filter, setFilter] = useState<"all" | "mine" | "shared">("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<BoardSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateBoard = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newBoardTitle.trim() || `Tablero OBoardS ${boards.length + 1}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        board?: BoardSummary;
        error?: string;
      };
      if (res.ok && data.board) {
        setNewBoardTitle("");
        setNewBoardOpen(false);
        window.location.href = `/board/${data.board.id}`;
      } else {
        setCreateError(
          data.error || `No se pudo crear el tablero (HTTP ${res.status}).`
        );
      }
    } catch {
      setCreateError("Error de conexión al crear el tablero.");
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (board: BoardSummary) => {
    setActionError(null);
    try {
      const res = await fetch(
        `/api/boards/${encodeURIComponent(board.id)}/duplicate`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        board?: BoardSummary;
        error?: string;
      };
      if (res.ok && data.board) {
        setBoards((prev) => [data.board!, ...prev]);
      } else {
        setActionError(
          data.error || `No se pudo duplicar el tablero (HTTP ${res.status}).`
        );
      }
    } catch {
      setActionError("Error de conexión al duplicar el tablero.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/boards/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setBoards((prev) => prev.filter((b) => b.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setActionError(
          data.error || `No se pudo eliminar el tablero (HTTP ${res.status}).`
        );
      }
    } catch {
      setActionError("Error de conexión al eliminar el tablero.");
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyObs = async (board: BoardSummary) => {
    const url = `${window.location.origin}/obs/${board.id}?token=${encodeURIComponent(board.obsToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(board.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const visibleBoards = boards.filter((b) => {
    if (filter === "mine" && b.myRole !== "owner") return false;
    if (filter === "shared" && b.myRole === "owner") return false;
    if (
      search.trim() &&
      !b.title.toLowerCase().includes(search.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-studio-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shadow-[0_0_18px_rgba(56,189,248,0.2)]">
              <MonitorPlay className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <BrandLogo size="md" />
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-studio-900 border border-white/[0.08] text-zinc-300">
                  <Radio className="w-2.5 h-2.5 text-emerald-400" />
                  {mode === "cloud" ? "Nube" : "Local OBS"}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 hidden sm:block">
                Tableros colaborativos 1080p transparentes para OBS Studio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMediaModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-studio-900 hover:bg-studio-850 border border-white/[0.09] text-zinc-200 text-xs font-medium transition-colors"
            >
              <Film className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Biblioteca Media</span>
              <span className="px-1.5 py-0.5 rounded-md bg-studio-800 text-[10px] font-mono tabular-nums text-zinc-300">
                {mediaCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setNewBoardOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-sky-600/25"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo tablero</span>
            </button>

            <div className="h-6 w-px bg-white/[0.08] mx-1 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: user.avatarColor }}
                title={`${user.name} (${user.email})`}
              >
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden md:block leading-tight">
                <p className="text-xs font-medium text-zinc-200 max-w-[140px] truncate">
                  {user.name}
                </p>
                <p className="text-[10px] text-zinc-500 max-w-[140px] truncate">
                  {user.email}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-850 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {actionError && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-300 hover:text-white font-medium shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Toolbar row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight text-balance">
              Tus tableros
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Abre un tablero para dibujar o disparar clips, y copia su enlace
              transparente para OBS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tablero…"
                className="rounded-xl bg-studio-900 border border-white/[0.09] pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400 w-52"
              />
            </div>

            <div className="flex rounded-xl bg-studio-900 border border-white/[0.08] p-1 text-xs">
              {(
                [
                  ["all", "Todos"],
                  ["mine", "Míos"],
                  ["shared", "Compartidos"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    filter === key
                      ? "bg-studio-800 text-white font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Boards Grid */}
        {visibleBoards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.12] bg-studio-900/40 py-20 px-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center mx-auto text-sky-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-medium text-zinc-200">
                {search || filter !== "all"
                  ? "No hay tableros con ese filtro"
                  : "Todavía no tienes tableros"}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Crea tu primer tablero 16:9 para empezar a dibujar y añadir clips
                en OBS Studio.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setNewBoardOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Crear mi primer tablero</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleBoards.map((board) => (
              <div
                key={board.id}
                className="group rounded-2xl bg-studio-900 border border-white/[0.08] hover:border-sky-400/50 transition-colors shadow-lg flex flex-col overflow-hidden"
              >
                <Link href={`/board/${board.id}`} className="block">
                  <BoardThumbnail board={board} />
                </Link>

                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <Link
                      href={`/board/${board.id}`}
                      className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors line-clamp-1"
                    >
                      {board.title}
                    </Link>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-500 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {board.elementCount} elem.
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {board.memberCount + 1}
                      </span>
                      <span>
                        {new Date(board.updatedAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    <Link
                      href={`/board/${board.id}`}
                      className="flex-1 text-center py-1.5 px-3 rounded-lg bg-sky-600/90 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
                    >
                      Abrir editor
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleCopyObs(board)}
                      title="Copiar URL transparente para OBS Studio"
                      className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-zinc-200 text-xs transition-colors"
                    >
                      {copiedId === board.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">OBS</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-sky-400" />
                          <span>OBS</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShareTarget(board)}
                      title="Compartir e invitar colaboradores"
                      aria-label="Compartir tablero"
                      className="p-1.5 rounded-lg bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-white transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicate(board)}
                      title="Duplicar tablero"
                      aria-label="Duplicar tablero"
                      className="p-1.5 rounded-lg bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-white transition-colors"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                    </button>

                    {board.myRole === "owner" && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(board)}
                        title="Eliminar tablero"
                        aria-label="Eliminar tablero"
                        className="p-1.5 rounded-lg bg-studio-850 hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/40 text-zinc-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Board Modal */}
      {newBoardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overscroll-contain"
          onClick={() => {
            setCreateError(null);
            setNewBoardOpen(false);
          }}
        >
          <form
            onSubmit={handleCreateBoard}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-studio-900 border border-white/[0.1] p-5 shadow-2xl space-y-4 animate-modal-enter"
          >
            <div>
              <h2 className="text-base font-semibold text-white">
                Crear nuevo tablero OBoardS
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Se creará un lienzo 1920×1080 transparente listo para colaborar y
                conectar a OBS Studio.
              </p>
            </div>
            {createError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-relaxed">
                {createError}
              </div>
            )}
            <input
              autoFocus
              type="text"
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              placeholder="Ej. Just Chatting, Torneo, Pizarra Clips…"
              className="w-full rounded-xl bg-studio-950 border border-white/[0.09] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setNewBoardOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-studio-850 hover:bg-studio-800 text-xs text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors"
              >
                {creating ? "Creando…" : "Crear y abrir"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Share Modal */}
      {shareTarget && (
        <ShareModal
          open={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
          boardId={shareTarget.id}
          boardTitle={shareTarget.title}
          obsToken={shareTarget.obsToken}
          myRole={shareTarget.myRole}
          onObsTokenChange={(newToken) => {
            setBoards((prev) =>
              prev.map((b) =>
                b.id === shareTarget.id ? { ...b, obsToken: newToken } : b
              )
            );
            setShareTarget((prev) =>
              prev ? { ...prev, obsToken: newToken } : null
            );
          }}
          onMembersChange={(members) => {
            setBoards((prev) =>
              prev.map((b) =>
                b.id === shareTarget.id
                  ? { ...b, memberCount: members.length }
                  : b
              )
            );
          }}
        />
      )}

      {/* Delete Board Confirm Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`¿Eliminar "${deleteTarget?.title ?? ""}"?`}
        description="Se eliminará el tablero y todos sus elementos permanentemente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar tablero"
        destructive
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Media Library Modal */}
      <MediaManagerModal
        open={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        onAssetsCountChange={setMediaCount}
      />
    </div>
  );
};
