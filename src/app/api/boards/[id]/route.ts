import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import {
  computeElementsHash,
  deleteBoard,
  getBoardForUser,
  updateBoardBackground,
  updateBoardTitle,
} from "@/lib/store";
import type { BoardBackgroundConfig } from "@/types/board";

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
  const serverHash = computeElementsHash(board.elements, board.background);

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
    background?: BoardBackgroundConfig;
    senderId?: string;
  };
  if (typeof body.title !== "string" && body.background === undefined) {
    return NextResponse.json(
      { error: "Título o configuración de fondo requerida" },
      { status: 400 }
    );
  }

  let nextTitle: string | undefined;
  let nextBackground: BoardBackgroundConfig | undefined;

  if (typeof body.title === "string") {
    const res = await updateBoardTitle(id, user, body.title);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    nextTitle = res.title;
  }

  if (body.background !== undefined) {
    const res = await updateBoardBackground(id, user, body.background);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 403 });
    }
    nextBackground = res.background;
  }

  realtimeHub.broadcast(
    id,
    {
      type: "board:meta",
      senderId: body.senderId ?? user.id,
      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      ...(nextBackground !== undefined ? { background: nextBackground } : {}),
    },
    body.senderId
  );
  return NextResponse.json({
    ok: true,
    ...(nextTitle !== undefined ? { title: nextTitle } : {}),
    ...(nextBackground !== undefined ? { background: nextBackground } : {}),
  });
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
