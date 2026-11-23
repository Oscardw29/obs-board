import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createBoard, listBoardsForUser } from "@/lib/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const boards = await listBoardsForUser(user);
  return NextResponse.json({ boards });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const board = await createBoard(user, body.title ?? "Nuevo Tablero OBS");
    return NextResponse.json({ board }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando tablero" },
      { status: 500 }
    );
  }
}
