import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import {
  computeElementsHash,
  deleteBoard,
  getBoardForUser,
  updateBoardTitle,
} from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const board = await getBoardForUser(id, user);
  if (!board) {
    return NextResponse.json(
      { error: "Tablero no encontrado o sin acceso" },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const clientHash = url.searchParams.get("hash");
  const serverHash = computeElementsHash(board.elements);

  if (clientHash && clientHash === serverHash) {
    return NextResponse.json(
      {
        unchanged: true,
        hash: serverHash,
        myRole: board.myRole,
        myPaused: board.myPaused ?? false,
        members: board.members,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  return NextResponse.json(
    { board, hash: serverHash },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
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
    title?: string;
    senderId?: string;
  };
  if (typeof body.title !== "string") {
    return NextResponse.json({ error: "Título requerido" }, { status: 400 });
  }
  const res = await updateBoardTitle(id, user, body.title);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 403 });
  }
  realtimeHub.broadcast(
    id,
    {
      type: "board:meta",
      senderId: body.senderId ?? user.id,
      title: res.title!,
    },
    body.senderId
  );
  return NextResponse.json({ ok: true, title: res.title });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const res = await deleteBoard(id, user);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
