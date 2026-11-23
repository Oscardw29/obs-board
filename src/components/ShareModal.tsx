"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  MonitorPlay,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type { BoardMember, BoardRole } from "@/types/board";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardTitle: string;
  obsToken: string;
  myRole: BoardRole;
  initialMembers?: BoardMember[];
  onObsTokenChange?: (newToken: string) => void;
  onMembersChange?: (members: BoardMember[]) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  open,
  onClose,
  boardId,
  boardTitle,
  obsToken,
  myRole,
  initialMembers,
  onObsTokenChange,
  onMembersChange,
}) => {
  const [members, setMembers] = useState<BoardMember[]>(initialMembers ?? []);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<BoardRole, "owner">>("editor");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copiedObs, setCopiedObs] = useState(false);
  const [copiedEditor, setCopiedEditor] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!open) return;
    setInviteError(null);
    setLoadingMembers(true);
    fetch(`/api/boards/${encodeURIComponent(boardId)}/members`)
      .then((r) => r.json())
      .then((data: { members?: BoardMember[] }) => {
        if (data.members) {
          setMembers(data.members);
          onMembersChange?.(data.members);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [open, boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const obsUrl = `${origin}/obs/${boardId}?token=${encodeURIComponent(obsToken)}`;
  const editorUrl = `${origin}/board/${boardId}`;
  const isOwner = myRole === "owner";

  const copyText = async (text: string, type: "obs" | "editor") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "obs") {
        setCopiedObs(true);
        setTimeout(() => setCopiedObs(false), 2000);
      } else {
        setCopiedEditor(true);
        setTimeout(() => setCopiedEditor(false), 2000);
      }
    } catch {
      // Fallback ignored
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviteError(null);
    setInviting(true);
    try {
      const res = await fetch(
        `/api/boards/${encodeURIComponent(boardId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role }),
        }
      );
      const data = (await res.json()) as {
        member?: BoardMember;
        error?: string;
      };
      if (!res.ok || !data.member) {
        setInviteError(data.error || "No se pudo invitar al usuario.");
        return;
      }
      const next = [
        ...members.filter((m) => m.id !== data.member!.id && m.email !== data.member!.email),
        data.member,
      ];
      setMembers(next);
      onMembersChange?.(next);
      setEmail("");
    } catch {
      setInviteError("Error de red al invitar.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const res = await fetch(
      `/api/boards/${encodeURIComponent(boardId)}/members?memberId=${encodeURIComponent(memberId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const next = members.filter((m) => m.id !== memberId);
      setMembers(next);
      onMembersChange?.(next);
    }
  };

  const handleRegenerateObsToken = async () => {
    if (
      !window.confirm(
        "¿Regenerar el enlace de OBS? El enlace anterior dejará de funcionar inmediatamente en OBS Studio."
      )
    ) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(
        `/api/boards/${encodeURIComponent(boardId)}/regenerate-token`,
        { method: "POST" }
      );
      const data = (await res.json()) as { obsToken?: string };
      if (res.ok && data.obsToken) {
        onObsTokenChange?.(data.obsToken);
      }
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-studio-900 border border-studio-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-800">
          <div>
            <h2 className="text-base font-semibold text-white">
              Compartir y OBS Studio
            </h2>
            <p className="text-xs text-zinc-400 truncate max-w-md">
              {boardTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* OBS Browser Source section */}
          <div className="rounded-xl bg-studio-950 border border-indigo-500/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-300 font-medium text-sm">
                <MonitorPlay className="w-4 h-4" />
                <span>Fuente de Navegador OBS (Transparente)</span>
              </div>
              {isOwner && (
                <button
                  type="button"
                  disabled={regenerating}
                  onClick={handleRegenerateObsToken}
                  title="Invalidar enlace actual y crear uno nuevo"
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-300 transition"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`}
                  />
                  <span>Regenerar token</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={obsUrl}
                className="flex-1 rounded-lg bg-studio-900 border border-studio-700 px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => copyText(obsUrl, "obs")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shrink-0"
              >
                {copiedObs ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar URL</span>
                  </>
                )}
              </button>
              <a
                href={obsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir vista OBS en nueva pestaña"
                className="p-2 rounded-lg bg-studio-850 hover:bg-studio-800 border border-studio-700 text-zinc-300 hover:text-white transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-zinc-400">
              <div className="rounded-lg bg-studio-900/90 border border-studio-800 px-2.5 py-2">
                <span className="text-zinc-200 font-medium block">
                  1920 × 1080
                </span>
                Tamaño exacto
              </div>
              <div className="rounded-lg bg-studio-900/90 border border-studio-800 px-2.5 py-2">
                <span className="text-zinc-200 font-medium block">
                  Fondo Alfa
                </span>
                100% transparente
              </div>
              <div className="rounded-lg bg-studio-900/90 border border-studio-800 px-2.5 py-2">
                <span className="text-zinc-200 font-medium block">
                  Audio en OBS
                </span>
                Activa “Controlar audio”
              </div>
            </div>
          </div>

          {/* Private Collaborators Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-200 font-medium text-sm">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Colaboradores invitados (acceso privado)</span>
              </div>
              <button
                type="button"
                onClick={() => copyText(editorUrl, "editor")}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                {copiedEditor ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Enlace copiado</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Copiar enlace del editor</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Solo tú y las cuentas autorizadas en esta lista pueden entrar al
              tablero colaborativo.
            </p>

            {isOwner && (
              <form onSubmit={handleInvite} className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@invitado.com"
                    className="w-full rounded-lg bg-studio-950 border border-studio-700 pl-8 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <select
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as Exclude<BoardRole, "owner">)
                  }
                  className="rounded-lg bg-studio-950 border border-studio-700 px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Solo lectura</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium transition shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invitar</span>
                </button>
              </form>
            )}

            {inviteError && (
              <p className="text-xs text-rose-400">{inviteError}</p>
            )}

            <div className="rounded-xl bg-studio-950 border border-studio-800 divide-y divide-studio-800/70">
              {loadingMembers ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  Cargando colaboradores...
                </div>
              ) : members.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  Aún no has invitado a nadie. Este tablero es solo tuyo.
                </div>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-200 truncate">
                        {member.name || member.email}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {member.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          member.role === "editor"
                            ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                            : "bg-zinc-700/40 text-zinc-300 border border-zinc-600/40"
                        }`}
                      >
                        {member.role === "editor" ? "Editor" : "Lectura"}
                      </span>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member.id)}
                          title="Quitar acceso"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
