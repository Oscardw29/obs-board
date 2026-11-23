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
    return "Faltan las tablas en Supabase. Ejecuta supabase/schema.sql en el SQL Editor de tu proyecto Supabase.";
  }
  if (
    err.code === "42501" ||
    err.message.toLowerCase().includes("row-level security")
  ) {
    return `Permiso denegado por RLS en Supabase (${err.message}). Verifica que ejecutaste supabase/schema.sql completo y configuraste SUPABASE_SECRET_KEY en Vercel.`;
  }
  return err.message;
}

// ============================================================================
// BOARDS
// ============================================================================

export async function listBoardsForUser(user: User): Promise<BoardSummary[]> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return [];

    const emailLower = user.email.toLowerCase();

    // Fetch boards owned by user OR where user's email is an invited member
    const { data: memberships } = await supabase
      .from("board_members")
      .select("board_id")
      .ilike("email", emailLower);

    const sharedBoardIds = (memberships ?? []).map((m) => m.board_id as string);

    const { data: ownedBoards, error: ownedErr } = await supabase
      .from("boards")
      .select(
        "id, title, owner_id, owner_email, owner_name, obs_token, stage_width, stage_height, created_at, updated_at, board_members(id, email, role), board_elements(id, data, z_index, visible)"
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
          "id, title, owner_id, owner_email, owner_name, obs_token, stage_width, stage_height, created_at, updated_at, board_members(id, email, role), board_elements(id, data, z_index, visible)"
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
      const myRole: BoardRole =
        board.ownerId === user.id
          ? "owner"
          : members.find(
              (m) =>
                m.userId === user.id || m.email.toLowerCase() === emailLower
            )?.role ?? "viewer";

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
  const cleanTitle = title.trim() || "Nuevo Tablero OBS";
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

export async function getUserBoardRole(
  boardId: string,
  user: User
): Promise<BoardRole | null> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return null;
    const { data: board } = await supabase
      .from("boards")
      .select("id, owner_id")
      .eq("id", boardId)
      .maybeSingle();
    if (!board) return null;
    if (board.owner_id === user.id) return "owner";

    const { data: member } = await supabase
      .from("board_members")
      .select("role")
      .eq("board_id", boardId)
      .ilike("email", user.email.toLowerCase())
      .maybeSingle();

    return (member?.role as BoardRole | undefined) ?? null;
  }

  const db = readLocalDb();
  const board = db.boards.find((b) => b.id === boardId);
  if (!board) return null;
  if (board.ownerId === user.id) return "owner";

  const emailLower = user.email.toLowerCase();
  const member = db.members.find(
    (m) =>
      m.boardId === boardId &&
      (m.userId === user.id || m.email.toLowerCase() === emailLower)
  );
  return member?.role ?? null;
}

export async function getBoardForUser(
  boardId: string,
  user: User
): Promise<BoardDetail | null> {
  if (isSupabaseConfigured()) {
    const role = await getUserBoardRole(boardId, user);
    if (!role) return null;
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

    const elements = (elRows ?? []).map((r) => r.data as BoardElement);
    const members: BoardMember[] = (memberRows ?? []).map((m) => ({
      id: m.id,
      boardId: m.board_id,
      email: m.email,
      userId: m.user_id ?? undefined,
      name: m.name ?? undefined,
      role: m.role,
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
      myRole: role,
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
      };
    });

  const isOwner = board.ownerId === user.id;
  const member = members.find(
    (m) => m.userId === user.id || m.email.toLowerCase() === emailLower
  );
  if (!isOwner && !member) return null;

  const owner = db.users.find((u) => u.id === board.ownerId);
  const elements = db.elements
    .filter((e) => e.boardId === boardId)
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
  const role = await getUserBoardRole(boardId, user);
  if (!role || role === "viewer") {
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
// MEMBERS (INVITATIONS)
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
        .update({ role })
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
      invitedAt: now,
    };
    db.members.push(member);
    return { member };
  });
}

export async function removeBoardMember(
  boardId: string,
  user: User,
  memberId: string
): Promise<{ ok: boolean; error?: string }> {
  const myRole = await getUserBoardRole(boardId, user);
  if (myRole !== "owner") {
    return { ok: false, error: "Solo el propietario puede revocar accesos." };
  }

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { error } = await supabase
      .from("board_members")
      .delete()
      .eq("id", memberId)
      .eq("board_id", boardId);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true };
  }

  return mutateLocalDb((db) => {
    db.members = db.members.filter(
      (m) => !(m.boardId === boardId && m.id === memberId)
    );
    return { ok: true };
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
  const role = await getUserBoardRole(boardId, user);
  if (!role || role === "viewer") {
    return { ok: false, error: "No tienes permisos de edición en este tablero." };
  }

  const normalized: BoardElement = {
    ...element,
    boardId,
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

export async function patchElement(
  boardId: string,
  user: User,
  elementId: string,
  patch: Partial<BoardElement>
): Promise<{ ok: boolean; element?: BoardElement; error?: string }> {
  const role = await getUserBoardRole(boardId, user);
  if (!role || role === "viewer") {
    return { ok: false, error: "No tienes permisos de edición." };
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

export async function replaceElements(
  boardId: string,
  user: User,
  elements: BoardElement[]
): Promise<{ ok: boolean; error?: string }> {
  const role = await getUserBoardRole(boardId, user);
  if (!role || role === "viewer") {
    return { ok: false, error: "No tienes permisos de edición." };
  }

  const nowIso = new Date().toISOString();
  const normalized = elements.map((el) => ({
    ...el,
    boardId,
    updatedAt: el.updatedAt || Date.now(),
  }));

  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };

    const { error: delErr } = await supabase
      .from("board_elements")
      .delete()
      .eq("board_id", boardId);
    if (delErr) return { ok: false, error: formatSupabaseError(delErr) };

    if (normalized.length > 0) {
      const { error } = await supabase.from("board_elements").insert(
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
  const role = await getUserBoardRole(boardId, user);
  if (!role || role === "viewer") {
    return { ok: false, error: "No tienes permisos de edición." };
  }
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

// ============================================================================
// MEDIA LIBRARY (VIDEOS & IMAGES)
// ============================================================================

export async function listMediaForUser(user: User): Promise<MediaAsset[]> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from("media_assets")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    return (data ?? []).map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      kind: row.kind,
      mimeType: row.mime_type,
      url: row.url,
      fileName: row.file_name,
      sizeBytes: row.size_bytes,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      durationSec: row.duration_sec ?? undefined,
      tags: row.tags ?? [],
      createdAt: row.created_at,
    }));
  }

  const db = readLocalDb();
  return db.media
    .filter((m) => m.ownerId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveMediaAsset(
  user: User,
  input: {
    name: string;
    originalFileName: string;
    mimeType: string;
    kind: "video" | "image";
    buffer: Buffer;
    width?: number;
    height?: number;
    durationSec?: number;
    tags?: string[];
  }
): Promise<MediaAsset> {
  const id = `med_${nanoid(12)}`;
  const rawExt = path.extname(input.originalFileName).toLowerCase();
  const safeExt = /^[.][a-z0-9]{1,8}$/.test(rawExt)
    ? rawExt
    : input.kind === "video"
      ? ".mp4"
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
      createdAt: now,
    };

    const { error: dbError } = await supabase.from("media_assets").insert({
      id: asset.id,
      owner_id: asset.ownerId,
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
      created_at: asset.createdAt,
    });
    if (dbError) throw new Error(formatSupabaseError(dbError));
    return asset;
  }

  // Local filesystem storage
  const uploadsDir = getUploadsDir();
  const destPath = path.join(uploadsDir, storedFileName);
  fs.writeFileSync(destPath, input.buffer);

  const asset: MediaAsset = {
    id,
    ownerId: user.id,
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
    kind: "video" | "image";
    mimeType: string;
    url: string;
    fileName: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationSec?: number;
    tags?: string[];
  }
): Promise<MediaAsset> {
  if (!isSupabaseConfigured()) {
    throw new Error("Registro directo solo disponible en modo nube.");
  }
  const supabase = await getCloudDbClient();
  if (!supabase) throw new Error("Supabase no configurado");

  // Ensure the storage path belongs to the authenticated user
  if (!input.fileName.startsWith(`${user.id}/`)) {
    throw new Error("Ruta de archivo no autorizada.");
  }

  const now = new Date().toISOString();
  const asset: MediaAsset = {
    id: input.id || `med_${nanoid(12)}`,
    ownerId: user.id,
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
    createdAt: now,
  };

  const { error } = await supabase.from("media_assets").insert({
    id: asset.id,
    owner_id: asset.ownerId,
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
    created_at: asset.createdAt,
  });
  if (error) throw new Error(formatSupabaseError(error));

  return asset;
}

export async function updateMediaAsset(
  user: User,
  assetId: string,
  patch: { name?: string; tags?: string[] }
): Promise<{ ok: boolean; asset?: MediaAsset; error?: string }> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const updateData: Record<string, unknown> = {};
    if (patch.name !== undefined) updateData.name = patch.name.trim();
    if (patch.tags !== undefined) updateData.tags = patch.tags;

    const { data, error } = await supabase
      .from("media_assets")
      .update(updateData)
      .eq("id", assetId)
      .eq("owner_id", user.id)
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
      asset: {
        id: data.id,
        ownerId: data.owner_id,
        name: data.name,
        kind: data.kind,
        mimeType: data.mime_type,
        url: data.url,
        fileName: data.file_name,
        sizeBytes: data.size_bytes,
        width: data.width ?? undefined,
        height: data.height ?? undefined,
        durationSec: data.duration_sec ?? undefined,
        tags: data.tags ?? [],
        createdAt: data.created_at,
      },
    };
  }

  return mutateLocalDb((db) => {
    const asset = db.media.find(
      (m) => m.id === assetId && m.ownerId === user.id
    );
    if (!asset) return { ok: false, error: "Archivo no encontrado." };
    if (patch.name !== undefined && patch.name.trim()) {
      asset.name = patch.name.trim();
    }
    if (patch.tags !== undefined) {
      asset.tags = patch.tags;
    }
    return { ok: true, asset };
  });
}

export async function deleteMediaAsset(
  user: User,
  assetId: string
): Promise<{ ok: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    const supabase = await getCloudDbClient();
    if (!supabase) return { ok: false, error: "Supabase no disponible." };
    const { data: asset } = await supabase
      .from("media_assets")
      .select("file_name")
      .eq("id", assetId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!asset) return { ok: false, error: "Archivo no encontrado." };

    await supabase.storage.from("obs-media").remove([asset.file_name]);
    const { error } = await supabase
      .from("media_assets")
      .delete()
      .eq("id", assetId)
      .eq("owner_id", user.id);
    if (error) return { ok: false, error: formatSupabaseError(error) };
    return { ok: true };
  }

  return mutateLocalDb((db) => {
    const idx = db.media.findIndex(
      (m) => m.id === assetId && m.ownerId === user.id
    );
    if (idx < 0) return { ok: false, error: "Archivo no encontrado." };
    const [removed] = db.media.splice(idx, 1);
    const filePath = path.join(getUploadsDir(), path.basename(removed.fileName));
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Ignore unlink race
    }
    return { ok: true };
  });
}
