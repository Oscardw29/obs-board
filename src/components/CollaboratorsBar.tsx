"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  PauseCircle,
  PlayCircle,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import type {
  BoardElement,
  BoardMember,
  BoardRole,
  OnlineMember,
} from "@/types/board";
import { ConfirmModal } from "./ui/ConfirmModal";
import { CustomSelect } from "./ui/CustomSelect";

interface CollaboratorsBarProps {
  boardId: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  myRole: BoardRole;
  members: BoardMember[];
  onlineMembers: OnlineMember[];
  elements: BoardElement[];
  onMembersChange: (members: BoardMember[]) => void;
  onAuthorVisibility: (
    target: { userId?: string; email?: string },
    visible: boolean
  ) => void;
  onAuthorDelete: (target: { userId?: string; email?: string }) => void;
  onMemberElementsDeleted: (elementIds: string[]) => void;
  onBroadcastMemberUpdated?: (member: BoardMember) => void;
  onBroadcastMemberKicked?: (payload: {
    memberId: string;
    userId?: string;
    email: string;
    deletedElementIds?: string[];
  }) => void;
  onOpenShareModal: () => void;
}

interface UnifiedPerson {
  key: string;
  memberId?: string;
  userId?: string;
  email: string;
  name: string;
  role: BoardRole;
  paused: boolean;
  online: boolean;
  color: string;
  elementCount: number;
  allHidden: boolean;
}

export const CollaboratorsBar: React.FC<CollaboratorsBarProps> = ({
  boardId,
  ownerId,
  ownerName,
  ownerEmail,
  myRole,
  members,
  onlineMembers,
  elements,
  onMembersChange,
  onAuthorVisibility,
  onAuthorDelete,
  onMemberElementsDeleted,
  onBroadcastMemberUpdated,
  onBroadcastMemberKicked,
  onOpenShareModal,
}) => {
  const [open, setOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<UnifiedPerson | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const people: UnifiedPerson[] = useMemo(() => {
    const onlineByEmail = new Map<string, OnlineMember>();
    const onlineByUserId = new Map<string, OnlineMember>();
    for (const om of onlineMembers) {
      if (om.email) onlineByEmail.set(om.email.toLowerCase(), om);
      if (om.userId) onlineByUserId.set(om.userId, om);
    }

    const statsFor = (userId?: string, email?: string) => {
      const matched = elements.filter(
        (e) =>
          (userId && e.createdByUserId === userId) ||
          (email &&
            e.createdByEmail &&
            e.createdByEmail.toLowerCase() === email.toLowerCase())
      );
      return {
        count: matched.length,
        allHidden: matched.length > 0 && matched.every((e) => !e.visible),
      };
    };

    const ownerOnline =
      onlineByUserId.get(ownerId) ||
      (ownerEmail ? onlineByEmail.get(ownerEmail.toLowerCase()) : undefined);
    const ownerStats = statsFor(ownerId, ownerEmail);

    const list: UnifiedPerson[] = [
      {
        key: `owner:${ownerId}`,
        userId: ownerId,
        email: ownerEmail,
        name: ownerName || "Propietario",
        role: "owner",
        paused: false,
        online: Boolean(ownerOnline),
        color: ownerOnline?.color ?? "#38bdf8",
        elementCount: ownerStats.count,
        allHidden: ownerStats.allHidden,
      },
    ];

    for (const m of members) {
      const om =
        (m.userId ? onlineByUserId.get(m.userId) : undefined) ||
        onlineByEmail.get(m.email.toLowerCase());
      const st = statsFor(m.userId ?? om?.userId, m.email);
      list.push({
        key: `member:${m.id}`,
        memberId: m.id,
        userId: m.userId ?? om?.userId,
        email: m.email,
        name: om?.name || m.name || m.email.split("@")[0],
        role: m.role,
        paused: Boolean(m.paused),
        online: Boolean(om),
        color: om?.color ?? "#64748b",
        elementCount: st.count,
        allHidden: st.allHidden,
      });
    }

    return list;
  }, [elements, members, onlineMembers, ownerEmail, ownerId, ownerName]);

  const onlineCount = people.filter((p) => p.online).length;
  const offlineCount = people.length - onlineCount;
  const isOwner = myRole === "owner";

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
      onMembersChange(
        members.map((m) => (m.id === memberId ? data.member! : m))
      );
      onBroadcastMemberUpdated?.(data.member);
    }
  };

  const handleConfirmKick = async (deleteElements: boolean) => {
    if (!kickTarget?.memberId) return;
    const kickedSnapshot = kickTarget;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/boards/${encodeURIComponent(boardId)}/members?memberId=${encodeURIComponent(kickedSnapshot.memberId!)}&deleteElements=${deleteElements ? "true" : "false"}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        deletedElementIds?: string[];
      };
      if (res.ok) {
        onMembersChange(
          members.filter((m) => m.id !== kickedSnapshot.memberId)
        );
        if (data.deletedElementIds?.length) {
          onMemberElementsDeleted(data.deletedElementIds);
        }
        onBroadcastMemberKicked?.({
          memberId: kickedSnapshot.memberId!,
          userId: kickedSnapshot.userId,
          email: kickedSnapshot.email,
          deletedElementIds: data.deletedElementIds,
        });
        setKickTarget(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteAuthorElements = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      onAuthorDelete({
        userId: deleteTarget.userId,
        email: deleteTarget.email,
      });
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div ref={containerRef} className="relative" data-tour="collaborators">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Ver personas conectadas/desconectadas y gestionar permisos"
          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.09] text-xs text-zinc-200 transition-colors"
        >
          <div className="flex items-center -space-x-1.5">
            {people.slice(0, 4).map((p) => (
              <div
                key={p.key}
                className="relative w-6 h-6 rounded-full border-2 border-studio-900 flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: p.color }}
              >
                {p.name.slice(0, 2).toUpperCase()}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-studio-900 ${
                    p.paused
                      ? "bg-amber-400"
                      : p.online
                        ? "bg-emerald-400"
                        : "bg-zinc-500"
                  }`}
                />
              </div>
            ))}
          </div>

          <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-mono tabular-nums">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-emerald-300">{onlineCount}</span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400">{people.length}</span>
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
              open ? "rotate-180 text-sky-400" : ""
            }`}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[92vw] rounded-2xl bg-studio-900 border border-white/[0.12] shadow-2xl overflow-hidden z-50 animate-popover-enter">
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between bg-studio-950/50">
              <div>
                <h3 className="text-xs font-semibold text-white">
                  Personas en este tablero
                </h3>
                <p className="text-[10px] text-zinc-400 font-mono tabular-nums">
                  {onlineCount} conectados · {offlineCount} desconectados
                </p>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenShareModal();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-colors"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Invitar</span>
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.06] p-2 space-y-1">
              {people.map((person) => (
                <div
                  key={person.key}
                  className="rounded-xl p-2.5 space-y-2 hover:bg-studio-950/60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="relative w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ backgroundColor: person.color }}
                      >
                        {person.name.slice(0, 2).toUpperCase()}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-studio-900 ${
                            person.paused
                              ? "bg-amber-400"
                              : person.online
                                ? "bg-emerald-400"
                                : "bg-zinc-500"
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-zinc-100 truncate">
                            {person.name}
                          </span>
                          {person.role === "owner" && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/35 text-[9px] font-semibold text-sky-300">
                              <Shield className="w-2.5 h-2.5" />
                              Creador
                            </span>
                          )}
                          {person.paused && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/35 text-[9px] font-semibold text-amber-300">
                              Pausado
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {person.online ? "Conectado ahora" : "Desconectado"} ·{" "}
                          {person.elementCount} elem.
                        </p>
                      </div>
                    </div>

                    {isOwner && person.role !== "owner" && person.memberId ? (
                      <div className="w-28 shrink-0">
                        <CustomSelect
                          ariaLabel={`Permiso de ${person.name}`}
                          value={person.role}
                          onChange={(val) =>
                            void handleUpdateMember(person.memberId!, {
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
                      <span className="text-[10px] text-zinc-400 font-medium px-2 py-0.5 rounded bg-studio-950 border border-white/[0.06]">
                        {person.role === "owner"
                          ? "Creador"
                          : person.role === "editor"
                            ? "Editor"
                            : "Lectura"}
                      </span>
                    )}
                  </div>

                  {/* Owner quick moderation actions for each collaborator (and author elements) */}
                  {isOwner && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-10">
                      {person.role !== "owner" && person.memberId && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateMember(person.memberId!, {
                              paused: !person.paused,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium transition-colors ${
                            person.paused
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-amber-500/10 border-amber-500/35 text-amber-300 hover:bg-amber-500/20"
                          }`}
                        >
                          {person.paused ? (
                            <>
                              <PlayCircle className="w-3 h-3" />
                              <span>Reanudar</span>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="w-3 h-3" />
                              <span>Pausar ya</span>
                            </>
                          )}
                        </button>
                      )}

                      {person.elementCount > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              onAuthorVisibility(
                                {
                                  userId: person.userId,
                                  email: person.email,
                                },
                                person.allHidden
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-studio-950 hover:bg-studio-800 border border-white/[0.08] text-[10px] text-zinc-300 transition-colors"
                          >
                            {person.allHidden ? (
                              <>
                                <Eye className="w-3 h-3 text-emerald-400" />
                                <span>Mostrar suyos</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3 text-zinc-400" />
                                <span>Ocultar suyos</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(person)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-studio-950 hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/35 text-[10px] text-zinc-300 hover:text-rose-300 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Borrar suyos</span>
                          </button>
                        </>
                      )}

                      {person.role !== "owner" && person.memberId && (
                        <button
                          type="button"
                          onClick={() => setKickTarget(person)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/35 text-[10px] font-medium text-rose-300 transition-colors"
                        >
                          <UserX className="w-3 h-3" />
                          <span>Expulsar</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!isOwner && (
              <div className="px-4 py-2.5 border-t border-white/[0.06] bg-studio-950/60 flex items-center gap-2 text-[11px] text-zinc-400">
                <UserCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>El creador del tablero controla los permisos en vivo.</span>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(kickTarget)}
        title={`¿Expulsar a ${kickTarget?.name ?? ""}?`}
        description="Perderá el acceso al tablero inmediatamente y dejará de ver o editar el contenido."
        confirmLabel="Expulsar del tablero"
        destructive
        loading={busy}
        checkboxLabel={`Eliminar también los ${kickTarget?.elementCount ?? 0} elementos que colocó en el tablero`}
        defaultCheckboxChecked={false}
        onCancel={() => setKickTarget(null)}
        onConfirm={handleConfirmKick}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`¿Borrar elementos de ${deleteTarget?.name ?? ""}?`}
        description={`Se eliminarán permanentemente los ${deleteTarget?.elementCount ?? 0} elementos creados por esta persona en el tablero.`}
        confirmLabel="Borrar elementos"
        destructive
        loading={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteAuthorElements}
      />
    </>
  );
};
