import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import {
  getBoardForUser,
  inviteBoardMember,
  removeBoardMember,
  updateBoardMember,
} from "@/lib/store";
import type { BoardRole } from "@/types/board";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const board = await getBoardForUser(id, user);
  if (!board) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 404 });
  }
  return NextResponse.json({ members: board.members });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    role?: Exclude<BoardRole, "owner">;
    senderId?: string;
  };
  const role: Exclude<BoardRole, "owner"> =
    body.role === "viewer" ? "viewer" : "editor";

  const res = await inviteBoardMember(id, user, body.email ?? "", role);
  if (res.error || !res.member) {
    return NextResponse.json(
      { error: res.error ?? "Error invitando usuario" },
      { status: 400 }
    );
  }
  realtimeHub.broadcast(
    id,
    {
      type: "member:updated",
      senderId: body.senderId || user.id,
      member: res.member,
    },
    body.senderId
  );
  return NextResponse.json({ member: res.member }, { status: 201 });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    memberId?: string;
    role?: Exclude<BoardRole, "owner">;
    paused?: boolean;
    senderId?: string;
  };

  if (!body.memberId) {
    return NextResponse.json({ error: "memberId requerido" }, { status: 400 });
  }

  const patch: { role?: Exclude<BoardRole, "owner">; paused?: boolean } = {};
  if (body.role === "editor" || body.role === "viewer") {
    patch.role = body.role;
  }
  if (typeof body.paused === "boolean") {
    patch.paused = body.paused;
  }

  const res = await updateBoardMember(id, user, body.memberId, patch);
  if (!res.ok || !res.member) {
    return NextResponse.json(
      { error: res.error ?? "Error actualizando colaborador" },
      { status: 403 }
    );
  }

  realtimeHub.updateMemberPresence(
    id,
    { userId: res.member.userId, email: res.member.email },
    { role: res.member.role, paused: Boolean(res.member.paused) }
  );

  realtimeHub.broadcast(
    id,
    {
      type: "member:updated",
      senderId: body.senderId || user.id,
      member: res.member,
    },
    body.senderId
  );

  return NextResponse.json({ ok: true, member: res.member });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId") ?? "";
  const deleteElements = url.searchParams.get("deleteElements") === "true";
  const senderId = url.searchParams.get("senderId") || user.id;

  if (!memberId) {
    return NextResponse.json({ error: "memberId requerido" }, { status: 400 });
  }

  const res = await removeBoardMember(id, user, memberId, deleteElements);
  if (!res.ok || !res.member) {
    return NextResponse.json({ error: res.error }, { status: 403 });
  }

  realtimeHub.broadcast(id, {
    type: "member:kicked",
    senderId,
    memberId,
    userId: res.member.userId,
    email: res.member.email,
    deletedElementIds: res.deletedElementIds,
  });

  if (res.deletedElementIds && res.deletedElementIds.length > 0) {
    realtimeHub.broadcast(
      id,
      {
        type: "element:delete",
        senderId,
        elementIds: res.deletedElementIds,
      },
      senderId
    );
  }

  return NextResponse.json({
    ok: true,
    deletedElementIds: res.deletedElementIds ?? [],
  });
}
