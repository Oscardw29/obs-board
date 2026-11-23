"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  MonitorPlay,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type { BoardMember, BoardRole } from "@/types/board";
import { ConfirmModal } from "./ui/ConfirmModal";
import { CustomSelect } from "./ui/CustomSelect";

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
  onMemberElementsDeleted?: (elementIds: string[]) => void;
  onBroadcastMemberUpdated?: (member: BoardMember) => void;
  onBroadcastMemberKicked?: (payload: {
    memberId: string;
    userId?: string;
    email: string;
    deletedElementIds?: string[];
  }) => void;
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
  onMemberElementsDeleted,
  onBroadcastMemberUpdated,
  onBroadcastMemberKicked,
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
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<BoardMember | null>(null);
  const [kicking, setKicking] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (initialMembers) setMembers(initialMembers);
  }, [initialMembers]);

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
        ...members.filter(
          (m) => m.id !== data.member!.id && m.email !== data.member!.email
        ),
        data.member,
      ];
      setMembers(next);
      onMembersChange?.(next);
      onBroadcastMemberUpdated?.(data.member);
      setEmail("");
    } catch {
      setInviteError("Error de red al invitar.");
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateMember = async (
    memberId: string,
    patch: { role?: Exclude<BoardRole, "owner">; paused?: boolean }
  ) => {
    const res = await fetch(
      `/api/boards/${encodeURIComponent(boardId)}/members`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, ...patch }),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      member?: BoardMember;
    };
    if (res.ok && data.member) {
      const next = members.map((m) => (m.id === memberId ? data.member! : m));
      setMembers(next);
      onMembersChange?.(next);
      onBroadcastMemberUpdated?.(data.member);
    }
  };

  const handleConfirmKick = async (deleteElements: boolean) => {
    if (!kickTarget) return;
    const kickedSnapshot = kickTarget;
    setKicking(true);
    try {
      const res = await fetch(
        `/api/boards/${encodeURIComponent(boardId)}/members?memberId=${encodeURIComponent(kickedSnapshot.id)}&deleteElements=${deleteElements ? "true" : "false"}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        deletedElementIds?: string[];
      };
      if (res.ok) {
        const next = members.filter((m) => m.id !== kickedSnapshot.id);
        setMembers(next);
        onMembersChange?.(next);
        if (data.deletedElementIds?.length) {
          onMemberElementsDeleted?.(data.deletedElementIds);
        }
        onBroadcastMemberKicked?.({
          memberId: kickedSnapshot.id,
          userId: kickedSnapshot.userId,
          email: kickedSnapshot.email,
          deletedElementIds: data.deletedElementIds,
        });
        setKickTarget(null);
      }
    } finally {
      setKicking(false);
    }
  };

  const handleRegenerateObsToken = async () => {
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
      setConfirmRegenOpen(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overscroll-contain"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-xl rounded-2xl bg-studio-900 border border-white/[0.1] shadow-2xl overflow-hidden animate-modal-enter"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
            <div>
              <h2 className="text-base font-semibold text-white">
                Compartir y OBS Studio
              </h2>
              <p className="text-xs text-zinc-400 truncate max-w-md">
                {boardTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ventana"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-studio-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto overscroll-contain">
            {/* OBS Browser Source section */}
            <div className="rounded-xl bg-studio-950 border border-sky-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sky-300 font-medium text-sm">
                  <MonitorPlay className="w-4 h-4" />
                  <span>Fuente de Navegador OBS (Transparente)</span>
                </div>
                {isOwner && (
                  <button
                    type="button"
                    disabled={regenerating}
                    onClick={() => setConfirmRegenOpen(true)}
                    title="Invalidar enlace actual y crear uno nuevo"
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-300 transition-colors"
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
                  aria-label="URL para OBS Studio"
                  value={obsUrl}
                  className="flex-1 rounded-lg bg-studio-900 border border-white/[0.08] px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyText(obsUrl, "obs")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shrink-0"
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
                  aria-label="Abrir vista OBS en nueva pestaña"
                  className="p-2 rounded-lg bg-studio-850 hover:bg-studio-800 border border-white/[0.08] text-zinc-300 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-zinc-400">
                <div className="rounded-lg bg-studio-900/90 border border-white/[0.06] px-2.5 py-2">
                  <span className="text-zinc-200 font-medium block">
                    1920 × 1080
                  </span>
                  Tamaño exacto
                </div>
                <div className="rounded-lg bg-studio-900/90 border border-white/[0.06] px-2.5 py-2">
                  <span className="text-zinc-200 font-medium block">
                    Fondo Alfa
                  </span>
                  100% transparente
                </div>
                <div className="rounded-lg bg-studio-900/90 border border-white/[0.06] px-2.5 py-2">
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
                  className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
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
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@invitado.com"
                      className="w-full rounded-xl bg-studio-950 border border-white/[0.09] pl-8 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="w-32">
                    <CustomSelect
                      ariaLabel="Rol del colaborador"
                      value={role}
                      onChange={(val) =>
                        setRole(val as Exclude<BoardRole, "owner">)
                      }
                      options={[
                        { value: "editor", label: "Editor" },
                        { value: "viewer", label: "Solo lectura" },
                      ]}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Invitar</span>
                  </button>
                </form>
              )}

              {inviteError && (
                <p className="text-xs text-rose-400">{inviteError}</p>
              )}

              <div className="rounded-xl bg-studio-950 border border-white/[0.08] divide-y divide-white/[0.06]">
                {loadingMembers ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    Cargando colaboradores…
                  </div>
                ) : members.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    Aún no has invitado a nadie. Este tablero es solo tuyo.
                  </div>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-zinc-200 truncate">
                            {member.name || member.email}
                          </p>
                          {member.paused && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-[9px] font-semibold text-amber-300">
                              Pausado
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {member.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOwner ? (
                          <div className="w-28">
                            <CustomSelect
                              ariaLabel={`Permiso de ${member.email}`}
                              value={member.role}
                              onChange={(val) =>
                                void handleUpdateMember(member.id, {
                                  role: val as Exclude<BoardRole, "owner">,
                                })
                              }
                              options={[
                                { value: "editor", label: "Editor" },
                                { value: "viewer", label: "Solo lectura" },
                              ]}
                            />
                          </div>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              member.role === "editor"
                                ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                                : "bg-zinc-700/40 text-zinc-300 border border-zinc-600/40"
                            }`}
                          >
                            {member.role === "editor" ? "Editor" : "Lectura"}
                          </span>
                        )}

                        {isOwner && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateMember(member.id, {
                                  paused: !member.paused,
                                })
                              }
                              title={
                                member.paused
                                  ? "Reanudar edición"
                                  : "Pausar inmediatamente (solo lectura)"
                              }
                              aria-label={
                                member.paused ? "Reanudar colaborador" : "Pausar colaborador"
                              }
                              className={`p-1.5 rounded-lg transition-colors ${
                                member.paused
                                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                                  : "text-zinc-400 hover:text-amber-300 hover:bg-studio-800"
                              }`}
                            >
                              {member.paused ? (
                                <PlayCircle className="w-3.5 h-3.5" />
                              ) : (
                                <PauseCircle className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setKickTarget(member)}
                              title="Expulsar del tablero"
                              aria-label="Expulsar colaborador"
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
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

      <ConfirmModal
        open={confirmRegenOpen}
        title="¿Regenerar enlace OBS?"
        description="El enlace actual dejará de funcionar de inmediato en OBS Studio y tendrás que pegar el nuevo URL en tu Fuente de Navegador."
        confirmLabel="Regenerar token"
        destructive
        loading={regenerating}
        onCancel={() => setConfirmRegenOpen(false)}
        onConfirm={handleRegenerateObsToken}
      />

      <ConfirmModal
        open={Boolean(kickTarget)}
        title={`Expulsar a ${kickTarget?.name || kickTarget?.email || ""}`}
        description="Esta persona perderá inmediatamente el acceso al tablero."
        confirmLabel="Expulsar del tablero"
        destructive
        loading={kicking}
        checkboxLabel="Eliminar también todos los elementos que esta persona colocó en el tablero"
        defaultCheckboxChecked={false}
        onCancel={() => setKickTarget(null)}
        onConfirm={handleConfirmKick}
      />
    </>
  );
};
