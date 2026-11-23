import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { duplicateBoard } from "@/lib/store";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const board = await duplicateBoard(id, user);
  if (!board) {
    return NextResponse.json(
      { error: "No se pudo duplicar el tablero" },
      { status: 404 }
    );
  }
  return NextResponse.json({ board }, { status: 201 });
}
