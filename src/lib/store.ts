import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BoardDetail,
  type BoardElement,
  type BoardMember,
  type BoardRole,
  type BoardSummary,
  type MediaAsset,
  type MediaFolder,
  type User,
} from "@/types/board";
import { isSupabaseConfigured } from "./config";
import { getUploadsDir, mutateLocalDb, readLocalDb } from "./local-db";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "./supabase/server";

function safeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Returns the server-side Supabase DB client.
 * Prefers the admin (secret key) client after the route has ALREADY verified
 * user identity via getCurrentUser(), while every function in this module
 * enforces explicit owner/member/editor checks in code (defense-in-depth).
 * Falls back to the user-scoped SSR client when SUPABASE_SECRET_KEY is absent.
 */
async function getCloudDbClient(): Promise<SupabaseClient | null> {
  const admin = getSupabaseAdminClient();
  if (admin) return admin;
  return getSupabaseServerClient();
}

function formatSupabaseError(err: { code?: string; message: string }): string {
  if (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    err.message.includes("Could not find the table")
  ) {
    return "Faltan tablas en Supabase. Ejecuta el archivo supabase/schema.sql actualizado en el SQL Editor de tu proyecto Supabase.";
  }
  if (
    err.code === "42501" ||
    err.message.toLowerCase().includes("row-level security")
  ) {
    return `Permiso denegado por RLS en Supabase (${err.message}). Verifica que ejecutaste supabase/schema.sql completo y configuraste SUPABASE_SECRET_KEY.`;
  }
  return err.message;
}

export function computeElementsHash(elements: BoardElement[]): string {
  const sorted = [...elements].sort((a, b) => a.id.localeCompare(b.id));
  const compact = sorted.map((e) => [
    e.id,
    e.updatedAt,
    e.visible ? 1 : 0,
    e.locked ? 1 : 0,
    Math.round(e.x),
    Math.round(e.y),
    Math.round(e.width),
    Math.round(e.height),
    Math.round(e.rotation),
    e.zIndex,
    e.opacity,
    e.text ?? "",
    e.currentPage ?? 0,
    e.triggerId ?? "",
    e.playing ? 1 : 0,
    e.strokeColor ?? "",
    e.fillColor ?? "",
  ]);
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(compact))
    .digest("hex")
    .slice(0, 16);
}

export interface BoardAccessInfo {
  role: BoardRole;
  paused: boolean;
}

function canEditAccess(access: BoardAccessInfo | null): boolean {
  return Boolean(access && access.role !== "viewer" && !access.paused);
}

// ============================================================================
// BOARDS & ACCESS
// ============================================================================

export async function getUserBoardAccess(
  boardId: string,
  user: User
): Promise<BoardAccessInfo | null> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return null;
    const { data: board } = await supabase
      .from("boards")
      .select("id, owner_id")
      .eq("id", boardId)
      .maybeSingle();
    if (!board) return null;
    if (board.owner_id === user.id) return { role: "owner", paused: false };

    const { data: member } = await supabase
      .from("board_members")
      .select("role, paused")
      .eq("board_id", boardId)
      .ilike("email", user.email.toLowerCase())
      .maybeSingle();

    if (!member) return null;
    return {
      role: member.role as BoardRole,
      paused: Boolean(member.paused),
    };
  }

  const db = readLocalDb();
  const board = db.boards.find((b) => b.id === boardId);
  if (!board) return null;
  if (board.ownerId === user.id) return { role: "owner", paused: false };

  const emailLower = user.email.toLowerCase();
  const member = db.members.find(
    (m) =>
      m.boardId === boardId &&
      (m.userId === user.id || m.email.toLowerCase() === emailLower)
  );
  if (!member) return null;
  return {
    role: member.role,
    paused: Boolean(member.paused),
  };
}

export async function getUserBoardRole(
  boardId: string,
  user: User
): Promise<BoardRole | null> {
  const access = await getUserBoardAccess(boardId, user);
  return access?.role ?? null;
}

export async function listBoardsForUser(user: User): Promise<BoardSummary[]> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return [];

    const emailLower = user.email.toLowerCase();

    const { data: memberships } = await supabase
      .from("board_members")
      .select("board_id")
      .ilike("email", emailLower);

    const sharedBoardIds = (memberships ?? []).map((m) => m.board_id as string);

    const { data: ownedBoards, error: ownedErr } = await supabase
      .from("boards")
      .select(
        "id, title, owner_id, owner_email, owner_name, obs_token, stage_width, stage_height, created_at, updated_at, board_members(id, email, role, paused), board_elements(id, data, z_index, visible)"
      )
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (ownedErr) {
      console.error("[listBoardsForUser] ownedBoards error:", ownedErr);
    }

    let sharedBoards: typeof ownedBoards = [];
    if (sharedBoardIds.length > 0) {
      const { data, error: sharedErr } = await supabase
        .from("boards")
        .select(
          "id, title, owner_id, owner_email, owner_name, obs_token, stage_width, stage_height, created_at, updated_at, board_members(id, email, role, paused), board_elements(id, data, z_index, visible)"
        )
        .in("id", sharedBoardIds)
        .neq("owner_id", user.id)
        .order("updated_at", { ascending: false });
      if (sharedErr) {
        console.error("[listBoardsForUser] sharedBoards error:", sharedErr);
      }
      sharedBoards = data ?? [];
    }

    const combined = [...(ownedBoards ?? []), ...(sharedBoards ?? [])];
    const seen = new Set<string>();
    const uniqueBoards = combined.filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });

    return uniqueBoards
      .map((b) => {
        const members = (b.board_members ?? []) as Array<{
          id: string;
          email: string;
          role: Exclude<BoardRole, "owner">;
          paused?: boolean;
        }>;
        const rawEls = (b.board_elements ?? []) as Array<{
          data: BoardElement;
          z_index: number;
          visible: boolean;
        }>;
        const elements = rawEls
          .map((e) => e.data)
          .sort((a, c) => a.zIndex - c.zIndex);
        const isOwner = b.owner_id === user.id;
        const membership = members.find(
          (m) => m.email.toLowerCase() === emailLower
        );
        const myRole: BoardRole = isOwner
          ? "owner"
          : membership?.role ?? "viewer";

        return {
          id: b.id,
          title: b.title,
          ownerId: b.owner_id,
          ownerEmail: b.owner_email ?? "",
          ownerName: b.owner_name ?? "Propietario",
          obsToken: b.obs_token,
          stageWidth: b.stage_width ?? STAGE_WIDTH,
          stageHeight: b.stage_height ?? STAGE_HEIGHT,
          myRole,
          myPaused: isOwner ? false : Boolean(membership?.paused),
          memberCount: members.length,
          elementCount: elements.length,
          previewElements: elements.filter((e) => e.visible).slice(0, 25),
          createdAt: b.created_at,
          updatedAt: b.updated_at,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const db = readLocalDb();
  const emailLower = user.email.toLowerCase();

  const accessible = db.boards.filter((board) => {
    if (board.ownerId === user.id) return true;
    return db.members.some(
      (m) =>
        m.boardId === board.id &&
        (m.userId === user.id || m.email.toLowerCase() === emailLower)
    );
  });

  return accessible
    .map((board) => {
      const owner = db.users.find((u) => u.id === board.ownerId);
      const members = db.members.filter((m) => m.boardId === board.id);
      const elements = db.elements
        .filter((e) => e.boardId === board.id)
        .sort((a, b) => a.zIndex - b.zIndex);
      const membership = members.find(
        (m) => m.userId === user.id || m.email.toLowerCase() === emailLower
      );
      const myRole: BoardRole =
        board.ownerId === user.id ? "owner" : membership?.role ?? "viewer";

      return {
        id: board.id,
        title: board.title,
        ownerId: board.ownerId,
        ownerEmail: owner?.email ?? "",
        ownerName: owner?.name ?? "Propietario",
        obsToken: board.obsToken,
        stageWidth: board.stageWidth,
        stageHeight: board.stageHeight,
        myRole,
        myPaused: board.ownerId === user.id ? false : Boolean(membership?.paused),
        memberCount: members.length,
        elementCount: elements.length,
        previewElements: elements.filter((e) => e.visible).slice(0, 25),
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createBoard(
  user: User,
  title: string
): Promise<BoardDetail> {
  const cleanTitle = title.trim() || "Nuevo Tablero OBoardS";
  const now = new Date().toISOString();
  const id = `brd_${nanoid(12)}`;
  const obsToken = nanoid(24);

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) throw new Error("Supabase no configurado");

    const { error } = await supabase.from("boards").insert({
      id,
      title: cleanTitle,
      owner_id: user.id,
      owner_email: user.email,
      owner_name: user.name,
      obs_token: obsToken,
      stage_width: STAGE_WIDTH,
      stage_height: STAGE_HEIGHT,
      created_at: now,
      updated_at: now,
    });
    if (error) {
      console.error("[createBoard] Supabase insert error:", error);
      throw new Error(formatSupabaseError(error));
    }

    return {
      id,
      title: cleanTitle,
      ownerId: user.id,
      ownerEmail: user.email,
      ownerName: user.name,
      obsToken,
      stageWidth: STAGE_WIDTH,
      stageHeight: STAGE_HEIGHT,
      myRole: "owner",
      myPaused: false,
      memberCount: 0,
      elementCount: 0,
      previewElements: [],
      elements: [],
      members: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  return mutateLocalDb((db) => {
    db.boards.push({
      id,
      title: cleanTitle,
      ownerId: user.id,
      obsToken,
      stageWidth: STAGE_WIDTH,
      stageHeight: STAGE_HEIGHT,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      title: cleanTitle,
      ownerId: user.id,
      ownerEmail: user.email,
      ownerName: user.name,
      obsToken,
      stageWidth: STAGE_WIDTH,
      stageHeight: STAGE_HEIGHT,
      myRole: "owner",
      myPaused: false,
      memberCount: 0,
      elementCount: 0,
      previewElements: [],
      elements: [],
      members: [],
      createdAt: now,
      updatedAt: now,
    };
  });
}

export async function getBoardForUser(
  boardId: string,
  user: User
): Promise<BoardDetail | null> {
  if (isSupabaseConfigured()) {
    const access = await getUserBoardAccess(boardId, user);
    if (!access) return null;
    const supabase = await getCloudDbClient();
    if (!supabase) return null;

    const { data: b } = await supabase
      .from("boards")
      .select("*")
      .eq("id", boardId)
      .maybeSingle();
    if (!b) return null;

    const { data: memberRows } = await supabase
      .from("board_members")
      .select("*")
      .eq("board_id", boardId)
      .order("invited_at", { ascending: true });

    const { data: elRows } = await supabase
      .from("board_elements")
      .select("data")
      .eq("board_id", boardId)
      .order("z_index", { ascending: true });

    const ownerNameFallback = b.owner_name ?? "Propietario";
    const elements = (elRows ?? []).map((r) => {
      const el = r.data as BoardElement;
      return el.createdByName
        ? el
        : { ...el, createdByName: ownerNameFallback };
    });
    const members: BoardMember[] = (memberRows ?? []).map((m) => ({
      id: m.id,
      boardId: m.board_id,
      email: m.email,
      userId: m.user_id ?? undefined,
      name: m.name ?? undefined,
      role: m.role,
      paused: Boolean(m.paused),
      invitedAt: m.invited_at,
    }));

    return {
      id: b.id,
      title: b.title,
      ownerId: b.owner_id,
      ownerEmail: b.owner_email ?? "",
      ownerName: b.owner_name ?? "Propietario",
      obsToken: b.obs_token,
      stageWidth: b.stage_width ?? STAGE_WIDTH,
      stageHeight: b.stage_height ?? STAGE_HEIGHT,
      myRole: access.role,
      myPaused: access.paused,
      memberCount: members.length,
      elementCount: elements.length,
      previewElements: elements.filter((e) => e.visible).slice(0, 25),
      elements,
      members,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
    };
  }

  const db = readLocalDb();
  const board = db.boards.find((b) => b.id === boardId);
  if (!board) return null;

  const emailLower = user.email.toLowerCase();
  const members = db.members
    .filter((m) => m.boardId === boardId)
    .map((m) => {
      const matchedUser = db.users.find(
        (u) => u.id === m.userId || u.email.toLowerCase() === m.email.toLowerCase()
      );
      return {
        ...m,
        userId: matchedUser?.id ?? m.userId,
        name: matchedUser?.name ?? m.name,
        paused: Boolean(m.paused),
      };
    });

  const isOwner = board.ownerId === user.id;
  const member = members.find(
    (m) => m.userId === user.id || m.email.toLowerCase() === emailLower
  );
  if (!isOwner && !member) return null;

  const owner = db.users.find((u) => u.id === board.ownerId);
  const ownerNameFallback = owner?.name ?? "Propietario";
  const elements = db.elements
    .filter((e) => e.boardId === boardId)
    .map((e) =>
      e.createdByName ? e : { ...e, createdByName: ownerNameFallback }
    )
    .sort((a, b) => a.zIndex - b.zIndex);

  return {
    id: board.id,
    title: board.title,
    ownerId: board.ownerId,
    ownerEmail: owner?.email ?? "",
    ownerName: owner?.name ?? "Propietario",
    obsToken: board.obsToken,
    stageWidth: board.stageWidth,
    stageHeight: board.stageHeight,
    myRole: isOwner ? "owner" : member!.role,
    myPaused: isOwner ? false : Boolean(member?.paused),
    memberCount: members.length,
    elementCount: elements.length,
    previewElements: elements.filter((e) => e.visible).slice(0, 25),
    elements,
    members,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

export async function getBoardForObs(
  boardId: string,
  token: string
): Promise<{
  id: string;
  title: string;
  stageWidth: number;
  stageHeight: number;
  elements: BoardElement[];
} | null> {
  if (!token) return null;

  if (isSupabaseConfigured()) {
    const client = await getCloudDbClient();
    if (!client) return null;

    const { data: b } = await client
      .from("boards")
      .select("id, title, obs_token, stage_width, stage_height")
      .eq("id", boardId)
      .maybeSingle();

    if (!b || !safeTokenEqual(b.obs_token, token)) return null;

    const { data: elRows } = await client
      .from("board_elements")
      .select("data")
      .eq("board_id", boardId)
      .order("z_index", { ascending: true });

    return {
      id: b.id,
      title: b.title,
      stageWidth: b.stage_width ?? STAGE_WIDTH,
      stageHeight: b.stage_height ?? STAGE_HEIGHT,
      elements: (elRows ?? []).map((r) => r.data as BoardElement),
    };
  }

  const db = readLocalDb();
  const board = db.boards.find((b) => b.id === boardId);
  if (!board || !safeTokenEqual(board.obsToken, token)) return null;

  const elements = db.elements
    .filter((e) => e.boardId === boardId)
    .sort((a, b) => a.zIndex - b.zIndex);

  return {
    id: board.id,
    title: board.title,
    stageWidth: board.stageWidth,
    stageHeight: board.stageHeight,
    elements,
  };
}

export async function updateBoardTitle(
  boardId: string,
  user: User,
  title: string
): Promise<{ ok: boolean; title?: string; error?: string }> {
  const access = await getUserBoardAccess(boardId, user);
  if (!canEditAccess(access)) {
    return { ok: false, error: "Sin permisos para renombrar este tablero." };
  }
  const clean = title.trim() || "Tablero sin título";
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { error } = await supabase
      .from("boards")
      .update({ title: clean, updated_at: now })
      .eq("id", boardId);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true, title: clean };
  }

  return mutateLocalDb((db) => {
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return { ok: false, error: "Tablero no encontrado." };
    board.title = clean;
    board.updatedAt = now;
    return { ok: true, title: clean };
  });
}

export async function deleteBoard(
  boardId: string,
  user: User
): Promise<{ ok: boolean; error?: string }> {
  const role = await getUserBoardRole(boardId, user);
  if (role !== "owner") {
    return { ok: false, error: "Solo el propietario puede eliminar el tablero." };
  }

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { error } = await supabase.from("boards").delete().eq("id", boardId);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true };
  }

  return mutateLocalDb((db) => {
    db.boards = db.boards.filter((b) => b.id !== boardId);
    db.members = db.members.filter((m) => m.boardId !== boardId);
    db.elements = db.elements.filter((e) => e.boardId !== boardId);
    db.folders = db.folders.filter((f) => f.boardId !== boardId);
    return { ok: true };
  });
}

export async function duplicateBoard(
  boardId: string,
  user: User
): Promise<BoardDetail | null> {
  const source = await getBoardForUser(boardId, user);
  if (!source) return null;

  const created = await createBoard(user, `${source.title} (Copia)`);
  const nowMs = Date.now();
  const clonedElements: BoardElement[] = source.elements.map((el) => ({
    ...el,
    id: `el_${nanoid(12)}`,
    boardId: created.id,
    updatedAt: nowMs,
  }));

  if (clonedElements.length > 0) {
    await replaceElements(created.id, user, clonedElements);
  }

  return getBoardForUser(created.id, user);
}

export async function regenerateObsToken(
  boardId: string,
  user: User
): Promise<{ ok: boolean; obsToken?: string; error?: string }> {
  const role = await getUserBoardRole(boardId, user);
  if (role !== "owner") {
    return { ok: false, error: "Solo el propietario puede regenerar el enlace OBS." };
  }
  const newToken = nanoid(24);
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { error } = await supabase
      .from("boards")
      .update({ obs_token: newToken, updated_at: now })
      .eq("id", boardId);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true, obsToken: newToken };
  }

  return mutateLocalDb((db) => {
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return { ok: false, error: "Tablero no encontrado." };
    board.obsToken = newToken;
    board.updatedAt = now;
    return { ok: true, obsToken: newToken };
  });
}

// ============================================================================
// MEMBERS (INVITATIONS, ROLES, PAUSE & KICK)
// ============================================================================

export async function inviteBoardMember(
  boardId: string,
  user: User,
  emailInput: string,
  role: Exclude<BoardRole, "owner"> = "editor"
): Promise<{ member?: BoardMember; error?: string }> {
  const myRole = await getUserBoardRole(boardId, user);
  if (myRole !== "owner") {
    return { error: "Solo el propietario puede invitar colaboradores." };
  }

  const email = emailInput.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Ingresa un correo electrónico válido." };
  }
  if (email === user.email.toLowerCase()) {
    return { error: "Ya eres el propietario de este tablero." };
  }

  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { error: "Supabase no disponible." };

    const { data: existing } = await supabase
      .from("board_members")
      .select("*")
      .eq("board_id", boardId)
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("board_members")
        .update({ role, paused: false })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return { error: formatSupabaseError(error) };
      return {
        member: {
          id: data.id,
          boardId: data.board_id,
          email: data.email,
          userId: data.user_id ?? undefined,
          name: data.name ?? undefined,
          role: data.role,
          paused: Boolean(data.paused),
          invitedAt: data.invited_at,
        },
      };
    }

    const { data, error } = await supabase
      .from("board_members")
      .insert({
        id: `mem_${nanoid(12)}`,
        board_id: boardId,
        email,
        role,
        paused: false,
        invited_at: now,
      })
      .select("*")
      .single();

    if (error) return { error: formatSupabaseError(error) };
    return {
      member: {
        id: data.id,
        boardId: data.board_id,
        email: data.email,
        userId: data.user_id ?? undefined,
        name: data.name ?? undefined,
        role: data.role,
        paused: Boolean(data.paused),
        invitedAt: data.invited_at,
      },
    };
  }

  return mutateLocalDb((db) => {
    const existing = db.members.find(
      (m) => m.boardId === boardId && m.email.toLowerCase() === email
    );
    const matchedUser = db.users.find((u) => u.email.toLowerCase() === email);

    if (existing) {
      existing.role = role;
      existing.paused = false;
      existing.userId = matchedUser?.id;
      existing.name = matchedUser?.name;
      return { member: existing };
    }

    const member: BoardMember = {
      id: `mem_${nanoid(12)}`,
      boardId,
      email,
      userId: matchedUser?.id,
      name: matchedUser?.name,
      role,
      paused: false,
      invitedAt: now,
    };
    db.members.push(member);
    return { member };
  });
}

export async function updateBoardMember(
  boardId: string,
  user: User,
  memberId: string,
  patch: { role?: Exclude<BoardRole, "owner">; paused?: boolean }
): Promise<{ ok: boolean; member?: BoardMember; error?: string }> {
  const myRole = await getUserBoardRole(boardId, user);
  if (myRole !== "owner") {
    return { ok: false, error: "Solo el propietario puede gestionar permisos." };
  }

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const updatePayload: Record<string, unknown> = {};
    if (patch.role !== undefined) updatePayload.role = patch.role;
    if (patch.paused !== undefined) updatePayload.paused = patch.paused;

    const { data, error } = await supabase
      .from("board_members")
      .update(updatePayload)
      .eq("id", memberId)
      .eq("board_id", boardId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        error: error ? formatSupabaseError(error) : "Miembro no encontrado.",
      };
    }

    return {
      ok: true,
      member: {
        id: data.id,
        boardId: data.board_id,
        email: data.email,
        userId: data.user_id ?? undefined,
        name: data.name ?? undefined,
        role: data.role,
        paused: Boolean(data.paused),
        invitedAt: data.invited_at,
      },
    };
  }

  return mutateLocalDb((db) => {
    const member = db.members.find(
      (m) => m.boardId === boardId && m.id === memberId
    );
    if (!member) return { ok: false, error: "Miembro no encontrado." };
    if (patch.role !== undefined) member.role = patch.role;
    if (patch.paused !== undefined) member.paused = patch.paused;
    return { ok: true, member: { ...member } };
  });
}

function matchesAuthor(
  el: BoardElement,
  target: { userId?: string; email?: string }
): boolean {
  if (target.userId && el.createdByUserId && el.createdByUserId === target.userId) {
    return true;
  }
  if (
    target.email &&
    el.createdByEmail &&
    el.createdByEmail.toLowerCase() === target.email.toLowerCase()
  ) {
    return true;
  }
  return false;
}

export async function removeBoardMember(
  boardId: string,
  user: User,
  memberId: string,
  deleteAuthorElements = false
): Promise<{
  ok: boolean;
  member?: BoardMember;
  deletedElementIds?: string[];
  error?: string;
}> {
  const myRole = await getUserBoardRole(boardId, user);
  if (myRole !== "owner") {
    return { ok: false, error: "Solo el propietario puede revocar accesos." };
  }

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };

    const { data: memberRow } = await supabase
      .from("board_members")
      .select("*")
      .eq("id", memberId)
      .eq("board_id", boardId)
      .maybeSingle();

    if (!memberRow) {
      return { ok: false, error: "Miembro no encontrado." };
    }

    let deletedElementIds: string[] = [];
    if (deleteAuthorElements) {
      const { data: elRows } = await supabase
        .from("board_elements")
        .select("id, data")
        .eq("board_id", boardId);
      deletedElementIds = (elRows ?? [])
        .filter((r) =>
          matchesAuthor(r.data as BoardElement, {
            userId: memberRow.user_id ?? undefined,
            email: memberRow.email,
          })
        )
        .map((r) => r.id as string);

      if (deletedElementIds.length > 0) {
        await supabase
          .from("board_elements")
          .delete()
          .eq("board_id", boardId)
          .in("id", deletedElementIds);
      }
    }

    const { error } = await supabase
      .from("board_members")
      .delete()
      .eq("id", memberId)
      .eq("board_id", boardId);
    if (error) return { ok: false, error: formatSupabaseError(error) };

    return {
      ok: true,
      member: {
        id: memberRow.id,
        boardId: memberRow.board_id,
        email: memberRow.email,
        userId: memberRow.user_id ?? undefined,
        name: memberRow.name ?? undefined,
        role: memberRow.role,
        paused: Boolean(memberRow.paused),
        invitedAt: memberRow.invited_at,
      },
      deletedElementIds,
    };
  }

  return mutateLocalDb((db) => {
    const member = db.members.find(
      (m) => m.boardId === boardId && m.id === memberId
    );
    if (!member) return { ok: false, error: "Miembro no encontrado." };

    let deletedElementIds: string[] = [];
    if (deleteAuthorElements) {
      const matchedUser = db.users.find(
        (u) => u.email.toLowerCase() === member.email.toLowerCase()
      );
      const target = {
        userId: member.userId ?? matchedUser?.id,
        email: member.email,
      };
      deletedElementIds = db.elements
        .filter((e) => e.boardId === boardId && matchesAuthor(e, target))
        .map((e) => e.id);
      if (deletedElementIds.length > 0) {
        const delSet = new Set(deletedElementIds);
        db.elements = db.elements.filter(
          (e) => !(e.boardId === boardId && delSet.has(e.id))
        );
      }
    }

    db.members = db.members.filter(
      (m) => !(m.boardId === boardId && m.id === memberId)
    );
    return { ok: true, member, deletedElementIds };
  });
}

// ============================================================================
// ELEMENTS
// ============================================================================

export async function upsertElement(
  boardId: string,
  user: User,
  element: BoardElement
): Promise<{ ok: boolean; element?: BoardElement; error?: string }> {
  const access = await getUserBoardAccess(boardId, user);
  if (!canEditAccess(access)) {
    return {
      ok: false,
      error: access?.paused
        ? "Tu edición está pausada por el propietario del tablero."
        : "No tienes permisos de edición en este tablero.",
    };
  }

  const normalized: BoardElement = {
    ...element,
    boardId,
    createdByUserId: element.createdByUserId || user.id,
    createdByEmail: element.createdByEmail || user.email,
    createdByName: element.createdByName || user.name,
    updatedAt: Date.now(),
  };
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { error } = await supabase.from("board_elements").upsert({
      id: normalized.id,
      board_id: boardId,
      z_index: normalized.zIndex,
      visible: normalized.visible,
      data: normalized,
      updated_at: nowIso,
    });
    if (error) return { ok: false, error: formatSupabaseError(error) };
    await supabase
      .from("boards")
      .update({ updated_at: nowIso })
      .eq("id", boardId);
    return { ok: true, element: normalized };
  }

  return mutateLocalDb((db) => {
    const idx = db.elements.findIndex(
      (e) => e.boardId === boardId && e.id === normalized.id
    );
    if (idx >= 0) {
      db.elements[idx] = normalized;
    } else {
      db.elements.push(normalized);
    }
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true, element: normalized };
  });
}

export async function upsertManyElements(
  boardId: string,
  user: User,
  elements: BoardElement[]
): Promise<{ ok: boolean; elements?: BoardElement[]; error?: string }> {
  const access = await getUserBoardAccess(boardId, user);
  if (!canEditAccess(access)) {
    return {
      ok: false,
      error: access?.paused
        ? "Tu edición está pausada por el propietario."
        : "No tienes permisos de edición.",
    };
  }
  if (elements.length === 0) return { ok: true, elements: [] };

  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const normalized = elements.map((el) => ({
    ...el,
    boardId,
    createdByUserId: el.createdByUserId || user.id,
    createdByEmail: el.createdByEmail || user.email,
    createdByName: el.createdByName || user.name,
    updatedAt: nowMs,
  }));

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { error } = await supabase.from("board_elements").upsert(
      normalized.map((el) => ({
        id: el.id,
        board_id: boardId,
        z_index: el.zIndex,
        visible: el.visible,
        data: el,
        updated_at: nowIso,
      }))
    );
    if (error) return { ok: false, error: formatSupabaseError(error) };
    await supabase
      .from("boards")
      .update({ updated_at: nowIso })
      .eq("id", boardId);
    return { ok: true, elements: normalized };
  }

  return mutateLocalDb((db) => {
    for (const el of normalized) {
      const idx = db.elements.findIndex(
        (e) => e.boardId === boardId && e.id === el.id
      );
      if (idx >= 0) db.elements[idx] = el;
      else db.elements.push(el);
    }
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true, elements: normalized };
  });
}

export async function patchElement(
  boardId: string,
  user: User,
  elementId: string,
  patch: Partial<BoardElement>
): Promise<{ ok: boolean; element?: BoardElement; error?: string }> {
  const access = await getUserBoardAccess(boardId, user);
  if (!canEditAccess(access)) {
    return {
      ok: false,
      error: access?.paused
        ? "Tu edición está pausada por el propietario."
        : "No tienes permisos de edición.",
    };
  }

  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { data: existing } = await supabase
      .from("board_elements")
      .select("data")
      .eq("board_id", boardId)
      .eq("id", elementId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Elemento no encontrado." };
    const updated: BoardElement = {
      ...(existing.data as BoardElement),
      ...patch,
      id: elementId,
      boardId,
      updatedAt: Date.now(),
    };
    const { error } = await supabase
      .from("board_elements")
      .update({
        z_index: updated.zIndex,
        visible: updated.visible,
        data: updated,
        updated_at: nowIso,
      })
      .eq("board_id", boardId)
      .eq("id", elementId);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    await supabase
      .from("boards")
      .update({ updated_at: nowIso })
      .eq("id", boardId);
    return { ok: true, element: updated };
  }

  return mutateLocalDb((db) => {
    const idx = db.elements.findIndex(
      (e) => e.boardId === boardId && e.id === elementId
    );
    if (idx < 0) return { ok: false, error: "Elemento no encontrado." };
    const updated: BoardElement = {
      ...db.elements[idx],
      ...patch,
      id: elementId,
      boardId,
      updatedAt: Date.now(),
    };
    db.elements[idx] = updated;
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true, element: updated };
  });
}

export async function batchPatchElements(
  boardId: string,
  user: User,
  patches: Array<{ elementId: string; patch: Partial<BoardElement> }>
): Promise<{ ok: boolean; elements?: BoardElement[]; error?: string }> {
  const access = await getUserBoardAccess(boardId, user);
  if (!canEditAccess(access)) {
    return { ok: false, error: "No tienes permisos de edición." };
  }
  if (patches.length === 0) return { ok: true, elements: [] };

  const patchMap = new Map<string, Partial<BoardElement>>();
  for (const item of patches) {
    const prev = patchMap.get(item.elementId) ?? {};
    patchMap.set(item.elementId, { ...prev, ...item.patch });
  }

  const nowMs = Date.now();
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };

    const ids = Array.from(patchMap.keys());
    const { data: rows } = await supabase
      .from("board_elements")
      .select("id, data")
      .eq("board_id", boardId)
      .in("id", ids);

    const updatedEls: BoardElement[] = [];
    for (const r of rows ?? []) {
      const p = patchMap.get(r.id as string);
      if (!p) continue;
      updatedEls.push({
        ...(r.data as BoardElement),
        ...p,
        id: r.id as string,
        boardId,
        updatedAt: nowMs,
      });
    }

    if (updatedEls.length > 0) {
      const { error } = await supabase.from("board_elements").upsert(
        updatedEls.map((el) => ({
          id: el.id,
          board_id: boardId,
          z_index: el.zIndex,
          visible: el.visible,
          data: el,
          updated_at: nowIso,
        }))
      );
      if (error) return { ok: false, error: formatSupabaseError(error) };
      await supabase
        .from("boards")
        .update({ updated_at: nowIso })
        .eq("id", boardId);
    }

    return { ok: true, elements: updatedEls };
  }

  return mutateLocalDb((db) => {
    const updatedEls: BoardElement[] = [];
    for (let i = 0; i < db.elements.length; i++) {
      const el = db.elements[i];
      if (el.boardId !== boardId) continue;
      const p = patchMap.get(el.id);
      if (!p) continue;
      const next: BoardElement = {
        ...el,
        ...p,
        id: el.id,
        boardId,
        updatedAt: nowMs,
      };
      db.elements[i] = next;
      updatedEls.push(next);
    }
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true, elements: updatedEls };
  });
}

export async function replaceElements(
  boardId: string,
  user: User,
  elements: BoardElement[]
): Promise<{ ok: boolean; error?: string }> {
  const access = await getUserBoardAccess(boardId, user);
  if (!canEditAccess(access)) {
    return { ok: false, error: "No tienes permisos de edición." };
  }

  const nowIso = new Date().toISOString();
  const normalized = elements.map((el) => ({
    ...el,
    boardId,
    createdByUserId: el.createdByUserId || user.id,
    createdByEmail: el.createdByEmail || user.email,
    createdByName: el.createdByName || user.name,
    updatedAt: el.updatedAt || Date.now(),
  }));

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };

    // Upsert new/kept elements first so there is never an empty-board race window
    if (normalized.length > 0) {
      const { error: upErr } = await supabase.from("board_elements").upsert(
        normalized.map((el) => ({
          id: el.id,
          board_id: boardId,
          z_index: el.zIndex,
          visible: el.visible,
          data: el,
          updated_at: nowIso,
        }))
      );
      if (upErr) return { ok: false, error: formatSupabaseError(upErr) };
    }

    const keepIds = new Set(normalized.map((el) => el.id));
    const { data: existingRows } = await supabase
      .from("board_elements")
      .select("id")
      .eq("board_id", boardId);
    const staleIds = (existingRows ?? [])
      .map((r) => r.id as string)
      .filter((id) => !keepIds.has(id));

    if (staleIds.length > 0) {
      const { error: delErr } = await supabase
        .from("board_elements")
        .delete()
        .eq("board_id", boardId)
        .in("id", staleIds);
      if (delErr) return { ok: false, error: formatSupabaseError(delErr) };
    }

    await supabase
      .from("boards")
      .update({ updated_at: nowIso })
      .eq("id", boardId);
    return { ok: true };
  }

  return mutateLocalDb((db) => {
    db.elements = db.elements.filter((e) => e.boardId !== boardId);
    db.elements.push(...normalized);
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true };
  });
}

export async function deleteElements(
  boardId: string,
  user: User,
  elementIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const access = await getUserBoardAccess(boardId, user);
  if (!canEditAccess(access)) {
    return { ok: false, error: "No tienes permisos de edición." };
  }
  if (elementIds.length === 0) return { ok: true };
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { error } = await supabase
      .from("board_elements")
      .delete()
      .eq("board_id", boardId)
      .in("id", elementIds);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    await supabase
      .from("boards")
      .update({ updated_at: nowIso })
      .eq("id", boardId);
    return { ok: true };
  }

  const idSet = new Set(elementIds);
  return mutateLocalDb((db) => {
    db.elements = db.elements.filter(
      (e) => !(e.boardId === boardId && idSet.has(e.id))
    );
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true };
  });
}

export async function setElementsVisibilityByAuthor(
  boardId: string,
  user: User,
  target: { userId?: string; email?: string },
  visible: boolean
): Promise<{
  ok: boolean;
  patches?: Array<{ elementId: string; patch: Partial<BoardElement> }>;
  error?: string;
}> {
  const role = await getUserBoardRole(boardId, user);
  if (role !== "owner") {
    return {
      ok: false,
      error: "Solo el propietario puede moderar los elementos de un colaborador.",
    };
  }

  const nowMs = Date.now();
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };

    const { data: rows } = await supabase
      .from("board_elements")
      .select("id, data")
      .eq("board_id", boardId);

    const matched: BoardElement[] = [];
    for (const r of rows ?? []) {
      const el = r.data as BoardElement;
      if (matchesAuthor(el, target)) {
        matched.push({ ...el, visible, updatedAt: nowMs });
      }
    }

    if (matched.length > 0) {
      const { error } = await supabase.from("board_elements").upsert(
        matched.map((el) => ({
          id: el.id,
          board_id: boardId,
          z_index: el.zIndex,
          visible,
          data: el,
          updated_at: nowIso,
        }))
      );
      if (error) return { ok: false, error: formatSupabaseError(error) };
    }

    return {
      ok: true,
      patches: matched.map((el) => ({
        elementId: el.id,
        patch: { visible },
      })),
    };
  }

  return mutateLocalDb((db) => {
    const patches: Array<{ elementId: string; patch: Partial<BoardElement> }> =
      [];
    for (let i = 0; i < db.elements.length; i++) {
      const el = db.elements[i];
      if (el.boardId === boardId && matchesAuthor(el, target)) {
        db.elements[i] = { ...el, visible, updatedAt: nowMs };
        patches.push({ elementId: el.id, patch: { visible } });
      }
    }
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true, patches };
  });
}

export async function deleteElementsByAuthor(
  boardId: string,
  user: User,
  target: { userId?: string; email?: string }
): Promise<{ ok: boolean; deletedIds?: string[]; error?: string }> {
  const role = await getUserBoardRole(boardId, user);
  if (role !== "owner") {
    return {
      ok: false,
      error: "Solo el propietario puede eliminar los elementos de un colaborador.",
    };
  }

  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };

    const { data: rows } = await supabase
      .from("board_elements")
      .select("id, data")
      .eq("board_id", boardId);

    const deletedIds = (rows ?? [])
      .filter((r) => matchesAuthor(r.data as BoardElement, target))
      .map((r) => r.id as string);

    if (deletedIds.length > 0) {
      const { error } = await supabase
        .from("board_elements")
        .delete()
        .eq("board_id", boardId)
        .in("id", deletedIds);
      if (error) return { ok: false, error: formatSupabaseError(error) };
    }

    return { ok: true, deletedIds };
  }

  return mutateLocalDb((db) => {
    const deletedIds = db.elements
      .filter((e) => e.boardId === boardId && matchesAuthor(e, target))
      .map((e) => e.id);
    const delSet = new Set(deletedIds);
    db.elements = db.elements.filter(
      (e) => !(e.boardId === boardId && delSet.has(e.id))
    );
    const board = db.boards.find((b) => b.id === boardId);
    if (board) board.updatedAt = nowIso;
    return { ok: true, deletedIds };
  });
}

// ============================================================================
// SHARED MEDIA LIBRARY & FOLDERS
// ============================================================================

function mapSupabaseMediaRow(row: Record<string, unknown>): MediaAsset {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    boardId: (row.board_id as string | null | undefined) ?? null,
    folderId: (row.folder_id as string | null | undefined) ?? null,
    name: row.name as string,
    kind: row.kind as MediaAsset["kind"],
    mimeType: row.mime_type as string,
    url: row.url as string,
    fileName: row.file_name as string,
    sizeBytes: Number(row.size_bytes ?? 0),
    width: (row.width as number | null | undefined) ?? undefined,
    height: (row.height as number | null | undefined) ?? undefined,
    durationSec: (row.duration_sec as number | null | undefined) ?? undefined,
    tags: (row.tags as string[] | null | undefined) ?? [],
    color: (row.color as string | null | undefined) ?? undefined,
    uploadedByName:
      (row.uploaded_by_name as string | null | undefined) ?? undefined,
    metadata:
      (row.metadata as MediaAsset["metadata"] | null | undefined) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function mapSupabaseFolderRow(row: Record<string, unknown>): MediaFolder {
  return {
    id: row.id as string,
    boardId: (row.board_id as string | null | undefined) ?? null,
    ownerId: row.owner_id as string,
    name: row.name as string,
    color: (row.color as string) || "#38bdf8",
    createdAt: row.created_at as string,
  };
}

export async function listBoardMediaLibrary(
  user: User,
  boardId?: string | null
): Promise<{ assets: MediaAsset[]; folders: MediaFolder[] }> {
  if (boardId) {
    const access = await getUserBoardAccess(boardId, user);
    if (!access) return { assets: [], folders: [] };
  }

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { assets: [], folders: [] };

    if (boardId) {
      const [boardAssetsRes, ownAssetsRes, boardFoldersRes, ownFoldersRes] =
        await Promise.all([
          supabase
            .from("media_assets")
            .select("*")
            .eq("board_id", boardId)
            .order("created_at", { ascending: false }),
          supabase
            .from("media_assets")
            .select("*")
            .eq("owner_id", user.id)
            .is("board_id", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("media_folders")
            .select("*")
            .eq("board_id", boardId)
            .order("created_at", { ascending: true }),
          supabase
            .from("media_folders")
            .select("*")
            .eq("owner_id", user.id)
            .is("board_id", null)
            .order("created_at", { ascending: true }),
        ]);

      const assetMap = new Map<string, MediaAsset>();
      for (const row of [
        ...(boardAssetsRes.data ?? []),
        ...(ownAssetsRes.data ?? []),
      ]) {
        const mapped = mapSupabaseMediaRow(row as Record<string, unknown>);
        assetMap.set(mapped.id, mapped);
      }

      const folderMap = new Map<string, MediaFolder>();
      for (const row of [
        ...(boardFoldersRes.data ?? []),
        ...(ownFoldersRes.data ?? []),
      ]) {
        const mapped = mapSupabaseFolderRow(row as Record<string, unknown>);
        folderMap.set(mapped.id, mapped);
      }

      return {
        assets: Array.from(assetMap.values()).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        ),
        folders: Array.from(folderMap.values()).sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt)
        ),
      };
    }

    const [assetsRes, foldersRes] = await Promise.all([
      supabase
        .from("media_assets")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("media_folders")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    return {
      assets: (assetsRes.data ?? []).map((r) =>
        mapSupabaseMediaRow(r as Record<string, unknown>)
      ),
      folders: (foldersRes.data ?? []).map((r) =>
        mapSupabaseFolderRow(r as Record<string, unknown>)
      ),
    };
  }

  const db = readLocalDb();
  const assets = db.media
    .filter((m) =>
      boardId
        ? m.boardId === boardId || (m.ownerId === user.id && !m.boardId)
        : m.ownerId === user.id
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const folders = db.folders
    .filter((f) =>
      boardId
        ? f.boardId === boardId || (f.ownerId === user.id && !f.boardId)
        : f.ownerId === user.id
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { assets, folders };
}

export async function listMediaForUser(user: User): Promise<MediaAsset[]> {
  const { assets } = await listBoardMediaLibrary(user);
  return assets;
}

export async function createMediaFolder(
  user: User,
  input: { name: string; color?: string; boardId?: string | null }
): Promise<{ folder?: MediaFolder; error?: string }> {
  if (input.boardId) {
    const access = await getUserBoardAccess(input.boardId, user);
    if (!canEditAccess(access)) {
      return { error: "No tienes permisos para crear carpetas en este tablero." };
    }
  }

  const folder: MediaFolder = {
    id: `fld_${nanoid(12)}`,
    boardId: input.boardId ?? null,
    ownerId: user.id,
    name: input.name.trim() || "Nueva carpeta",
    color: input.color || "#38bdf8",
    createdAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { error: "Supabase no disponible." };
    const { error } = await supabase.from("media_folders").insert({
      id: folder.id,
      board_id: folder.boardId,
      owner_id: folder.ownerId,
      name: folder.name,
      color: folder.color,
      created_at: folder.createdAt,
    });
    if (error) return { error: formatSupabaseError(error) };
    return { folder };
  }

  return mutateLocalDb((db) => {
    db.folders.push(folder);
    return { folder };
  });
}

export async function updateMediaFolder(
  user: User,
  folderId: string,
  patch: { name?: string; color?: string }
): Promise<{ ok: boolean; folder?: MediaFolder; error?: string }> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { data: existing } = await supabase
      .from("media_folders")
      .select("*")
      .eq("id", folderId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Carpeta no encontrada." };

    const canEdit =
      existing.owner_id === user.id ||
      (existing.board_id
        ? canEditAccess(await getUserBoardAccess(existing.board_id, user))
        : false);
    if (!canEdit) return { ok: false, error: "Sin permisos para editar esta carpeta." };

    const updateData: Record<string, unknown> = {};
    if (patch.name !== undefined && patch.name.trim()) {
      updateData.name = patch.name.trim();
    }
    if (patch.color !== undefined) {
      updateData.color = patch.color;
    }

    const { data, error } = await supabase
      .from("media_folders")
      .update(updateData)
      .eq("id", folderId)
      .select("*")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: error ? formatSupabaseError(error) : "Error actualizando carpeta.",
      };
    }
    return {
      ok: true,
      folder: mapSupabaseFolderRow(data as Record<string, unknown>),
    };
  }

  const dbCheck = readLocalDb();
  const target = dbCheck.folders.find((f) => f.id === folderId);
  if (!target) return { ok: false, error: "Carpeta no encontrada." };
  if (target.ownerId !== user.id) {
    if (!target.boardId) return { ok: false, error: "Sin permisos." };
    const access = await getUserBoardAccess(target.boardId, user);
    if (!canEditAccess(access)) return { ok: false, error: "Sin permisos." };
  }

  return mutateLocalDb((db) => {
    const folder = db.folders.find((f) => f.id === folderId);
    if (!folder) return { ok: false, error: "Carpeta no encontrada." };
    if (patch.name !== undefined && patch.name.trim()) {
      folder.name = patch.name.trim();
    }
    if (patch.color !== undefined) {
      folder.color = patch.color;
    }
    return { ok: true, folder };
  });
}

export async function deleteMediaFolder(
  user: User,
  folderId: string
): Promise<{ ok: boolean; boardId?: string | null; error?: string }> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { data: existing } = await supabase
      .from("media_folders")
      .select("*")
      .eq("id", folderId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Carpeta no encontrada." };

    const canEdit =
      existing.owner_id === user.id ||
      (existing.board_id
        ? canEditAccess(await getUserBoardAccess(existing.board_id, user))
        : false);
    if (!canEdit) return { ok: false, error: "Sin permisos para eliminar carpeta." };

    await supabase
      .from("media_assets")
      .update({ folder_id: null })
      .eq("folder_id", folderId);

    const { error } = await supabase
      .from("media_folders")
      .delete()
      .eq("id", folderId);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true, boardId: existing.board_id };
  }

  const dbCheck = readLocalDb();
  const target = dbCheck.folders.find((f) => f.id === folderId);
  if (!target) return { ok: false, error: "Carpeta no encontrada." };
  if (target.ownerId !== user.id) {
    if (!target.boardId) return { ok: false, error: "Sin permisos." };
    const access = await getUserBoardAccess(target.boardId, user);
    if (!canEditAccess(access)) return { ok: false, error: "Sin permisos." };
  }

  return mutateLocalDb((db) => {
    const removed = db.folders.find((f) => f.id === folderId);
    db.folders = db.folders.filter((f) => f.id !== folderId);
    for (const asset of db.media) {
      if (asset.folderId === folderId) {
        asset.folderId = null;
      }
    }
    return { ok: true, boardId: removed?.boardId ?? null };
  });
}

export async function saveRawLocalUpload(
  originalFileName: string,
  buffer: Buffer
): Promise<{ url: string; fileName: string }> {
  const id = `raw_${nanoid(12)}`;
  const rawExt = path.extname(originalFileName).toLowerCase();
  const safeExt = /^[.][a-z0-9]{1,8}$/.test(rawExt) ? rawExt : ".png";
  const storedFileName = `${id}${safeExt}`;
  const uploadsDir = getUploadsDir();
  fs.writeFileSync(path.join(uploadsDir, storedFileName), buffer);
  return {
    url: `/api/media/file/${storedFileName}`,
    fileName: storedFileName,
  };
}

export async function saveMediaAsset(
  user: User,
  input: {
    name: string;
    originalFileName: string;
    mimeType: string;
    kind: MediaAsset["kind"];
    buffer: Buffer;
    width?: number;
    height?: number;
    durationSec?: number;
    tags?: string[];
    boardId?: string | null;
    folderId?: string | null;
    color?: string;
    metadata?: MediaAsset["metadata"];
  }
): Promise<MediaAsset> {
  if (input.boardId) {
    const access = await getUserBoardAccess(input.boardId, user);
    if (!canEditAccess(access)) {
      throw new Error("No tienes permisos para subir archivos a este tablero.");
    }
  }

  const id = `med_${nanoid(12)}`;
  const rawExt = path.extname(input.originalFileName).toLowerCase();
  const safeExt = /^[.][a-z0-9]{1,8}$/.test(rawExt)
    ? rawExt
    : input.kind === "video"
      ? ".mp4"
      : input.kind === "font"
        ? ".ttf"
        : ".png";
  const storedFileName = `${id}${safeExt}`;
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) throw new Error("Supabase no configurado");
    const storagePath = `${user.id}/${storedFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("obs-media")
      .upload(storagePath, input.buffer, {
        contentType: input.mimeType,
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: pub } = supabase.storage
      .from("obs-media")
      .getPublicUrl(storagePath);

    const asset: MediaAsset = {
      id,
      ownerId: user.id,
      boardId: input.boardId ?? null,
      folderId: input.folderId ?? null,
      name: input.name.trim() || input.originalFileName,
      kind: input.kind,
      mimeType: input.mimeType,
      url: pub.publicUrl,
      fileName: storagePath,
      sizeBytes: input.buffer.length,
      width: input.width,
      height: input.height,
      durationSec: input.durationSec,
      tags: input.tags ?? [],
      color: input.color,
      uploadedByName: user.name,
      metadata: input.metadata,
      createdAt: now,
    };

    const { error: dbError } = await supabase.from("media_assets").insert({
      id: asset.id,
      owner_id: asset.ownerId,
      board_id: asset.boardId,
      folder_id: asset.folderId,
      name: asset.name,
      kind: asset.kind,
      mime_type: asset.mimeType,
      url: asset.url,
      file_name: asset.fileName,
      size_bytes: asset.sizeBytes,
      width: asset.width ?? null,
      height: asset.height ?? null,
      duration_sec: asset.durationSec ?? null,
      tags: asset.tags,
      color: asset.color ?? null,
      uploaded_by_name: asset.uploadedByName ?? null,
      metadata: asset.metadata ?? {},
      created_at: asset.createdAt,
    });
    if (dbError) throw new Error(formatSupabaseError(dbError));
    return asset;
  }

  const uploadsDir = getUploadsDir();
  const destPath = path.join(uploadsDir, storedFileName);
  fs.writeFileSync(destPath, input.buffer);

  const asset: MediaAsset = {
    id,
    ownerId: user.id,
    boardId: input.boardId ?? null,
    folderId: input.folderId ?? null,
    name: input.name.trim() || input.originalFileName,
    kind: input.kind,
    mimeType: input.mimeType,
    url: `/api/media/file/${storedFileName}`,
    fileName: storedFileName,
    sizeBytes: input.buffer.length,
    width: input.width,
    height: input.height,
    durationSec: input.durationSec,
    tags: input.tags ?? [],
    color: input.color,
    uploadedByName: user.name,
    metadata: input.metadata,
    createdAt: now,
  };

  return mutateLocalDb((db) => {
    db.media.push(asset);
    return asset;
  });
}

export async function registerCloudMediaAsset(
  user: User,
  input: {
    id: string;
    name: string;
    kind: MediaAsset["kind"];
    mimeType: string;
    url: string;
    fileName: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationSec?: number;
    tags?: string[];
    boardId?: string | null;
    folderId?: string | null;
    color?: string;
    metadata?: MediaAsset["metadata"];
  }
): Promise<MediaAsset> {
  if (input.boardId) {
    const access = await getUserBoardAccess(input.boardId, user);
    if (!canEditAccess(access)) {
      throw new Error("Sin permisos para registrar media en este tablero.");
    }
  }

  const now = new Date().toISOString();
  const asset: MediaAsset = {
    id: input.id || `med_${nanoid(12)}`,
    ownerId: user.id,
    boardId: input.boardId ?? null,
    folderId: input.folderId ?? null,
    name: input.name.trim() || "Archivo media",
    kind: input.kind,
    mimeType: input.mimeType,
    url: input.url,
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
    durationSec: input.durationSec,
    tags: input.tags ?? [],
    color: input.color,
    uploadedByName: user.name,
    metadata: input.metadata,
    createdAt: now,
  };

  if (!isSupabaseConfigured()) {
    return mutateLocalDb((db) => {
      db.media.push(asset);
      return asset;
    });
  }

  const supabase = await getCloudDbClient();
  if (!supabase) throw new Error("Supabase no configurado");

  if (
    input.kind !== "document" &&
    !input.fileName.startsWith(`${user.id}/`)
  ) {
    throw new Error("Ruta de archivo no autorizada.");
  }

  const { error } = await supabase.from("media_assets").insert({
    id: asset.id,
    owner_id: asset.ownerId,
    board_id: asset.boardId,
    folder_id: asset.folderId,
    name: asset.name,
    kind: asset.kind,
    mime_type: asset.mimeType,
    url: asset.url,
    file_name: asset.fileName,
    size_bytes: asset.sizeBytes,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration_sec: asset.durationSec ?? null,
    tags: asset.tags,
    color: asset.color ?? null,
    uploaded_by_name: asset.uploadedByName ?? null,
    metadata: asset.metadata ?? {},
    created_at: asset.createdAt,
  });
  if (error) throw new Error(formatSupabaseError(error));

  return asset;
}

export async function updateMediaAsset(
  user: User,
  assetId: string,
  patch: {
    name?: string;
    tags?: string[];
    folderId?: string | null;
    color?: string | null;
    boardId?: string | null;
  }
): Promise<{ ok: boolean; asset?: MediaAsset; error?: string }> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };

    const { data: existing } = await supabase
      .from("media_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Archivo no encontrado." };

    const canEdit =
      existing.owner_id === user.id ||
      (existing.board_id
        ? canEditAccess(await getUserBoardAccess(existing.board_id, user))
        : false);
    if (!canEdit) return { ok: false, error: "Sin permisos para editar este archivo." };

    const updateData: Record<string, unknown> = {};
    if (patch.name !== undefined && patch.name.trim()) {
      updateData.name = patch.name.trim();
    }
    if (patch.tags !== undefined) updateData.tags = patch.tags;
    if (patch.folderId !== undefined) updateData.folder_id = patch.folderId;
    if (patch.color !== undefined) updateData.color = patch.color;
    if (patch.boardId !== undefined) updateData.board_id = patch.boardId;

    const { data, error } = await supabase
      .from("media_assets")
      .update(updateData)
      .eq("id", assetId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        error: error ? formatSupabaseError(error) : "No encontrado",
      };
    }

    return {
      ok: true,
      asset: mapSupabaseMediaRow(data as Record<string, unknown>),
    };
  }

  const dbCheck = readLocalDb();
  const target = dbCheck.media.find((m) => m.id === assetId);
  if (!target) return { ok: false, error: "Archivo no encontrado." };
  if (target.ownerId !== user.id) {
    if (!target.boardId) return { ok: false, error: "Sin permisos." };
    const access = await getUserBoardAccess(target.boardId, user);
    if (!canEditAccess(access)) return { ok: false, error: "Sin permisos." };
  }

  return mutateLocalDb((db) => {
    const asset = db.media.find((m) => m.id === assetId);
    if (!asset) return { ok: false, error: "Archivo no encontrado." };
    if (patch.name !== undefined && patch.name.trim()) {
      asset.name = patch.name.trim();
    }
    if (patch.tags !== undefined) asset.tags = patch.tags;
    if (patch.folderId !== undefined) asset.folderId = patch.folderId;
    if (patch.color !== undefined) asset.color = patch.color ?? undefined;
    if (patch.boardId !== undefined) asset.boardId = patch.boardId;
    return { ok: true, asset };
  });
}

export async function deleteMediaAsset(
  user: User,
  assetId: string
): Promise<{ ok: boolean; boardId?: string | null; error?: string }> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { data: asset } = await supabase
      .from("media_assets")
      .select("file_name, owner_id, board_id, kind")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset) return { ok: false, error: "Archivo no encontrado." };

    const canEdit =
      asset.owner_id === user.id ||
      (asset.board_id
        ? canEditAccess(await getUserBoardAccess(asset.board_id, user))
        : false);
    if (!canEdit) return { ok: false, error: "Sin permisos para eliminar." };

    if (asset.kind !== "document" && asset.file_name) {
      await supabase.storage.from("obs-media").remove([asset.file_name]);
    }
    const { error } = await supabase
      .from("media_assets")
      .delete()
      .eq("id", assetId);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true, boardId: asset.board_id };
  }

  const dbCheck = readLocalDb();
  const target = dbCheck.media.find((m) => m.id === assetId);
  if (!target) return { ok: false, error: "Archivo no encontrado." };
  if (target.ownerId !== user.id) {
    if (!target.boardId) return { ok: false, error: "Sin permisos." };
    const access = await getUserBoardAccess(target.boardId, user);
    if (!canEditAccess(access)) return { ok: false, error: "Sin permisos." };
  }

  return mutateLocalDb((db) => {
    const idx = db.media.findIndex((m) => m.id === assetId);
    if (idx < 0) return { ok: false, error: "Archivo no encontrado." };
    const [removed] = db.media.splice(idx, 1);
    if (removed.kind !== "document") {
      const filePath = path.join(getUploadsDir(), path.basename(removed.fileName));
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // Ignore unlink race
      }
    }
    return { ok: true, boardId: removed.boardId ?? null };
  });
}
