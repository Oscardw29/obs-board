import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";
import { createMediaFolder, listBoardMediaLibrary } from "@/lib/store";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  const { folders } = await listBoardMediaLibrary(user, boardId);
  return NextResponse.json({ folders });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    color?: string;
    boardId?: string | null;
  };
  const res = await createMediaFolder(user, {
    name: body.name ?? "Nueva carpeta",
    color: body.color,
    boardId: body.boardId ?? null,
  });
  if (res.error || !res.folder) {
    return NextResponse.json(
      { error: res.error || "Error creando carpeta" },
      { status: 400 }
    );
  }
  if (res.folder.boardId) {
    realtimeHub.broadcast(res.folder.boardId, {
      type: "library:updated",
      senderId: user.id,
      boardId: res.folder.boardId,
    });
  }
  return NextResponse.json({ folder: res.folder }, { status: 201 });
}
