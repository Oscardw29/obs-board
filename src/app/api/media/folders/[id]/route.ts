import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import { deleteMediaFolder, updateMediaFolder } from "@/lib/store";

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
    name?: string;
    color?: string;
  };
  const res = await updateMediaFolder(user, id, body);
  if (!res.ok || !res.folder) {
    return NextResponse.json({ error: res.error }, { status: 403 });
  }
  if (res.folder.boardId) {
    realtimeHub.broadcast(res.folder.boardId, {
      type: "library:updated",
      senderId: user.id,
      boardId: res.folder.boardId,
    });
  }
  return NextResponse.json({ ok: true, folder: res.folder });
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
  const res = await deleteMediaFolder(user, id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 403 });
  }
  if (res.boardId) {
    realtimeHub.broadcast(res.boardId, {
      type: "library:updated",
      senderId: user.id,
      boardId: res.boardId,
    });
  }
  return NextResponse.json({ ok: true });
}
