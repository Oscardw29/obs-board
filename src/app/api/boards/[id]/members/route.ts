import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getBoardForUser,
  inviteBoardMember,
  removeBoardMember,
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
  return NextResponse.json({ member: res.member }, { status: 201 });
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
  if (!memberId) {
    return NextResponse.json({ error: "memberId requerido" }, { status: 400 });
  }
  const res = await removeBoardMember(id, user, memberId);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
