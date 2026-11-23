import { NextResponse } from "next/server";
import { computeElementsHash, getBoardForObs } from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const clientHash = url.searchParams.get("hash");
  const board = await getBoardForObs(id, token);

  if (!board) {
    return NextResponse.json(
      { error: "Enlace OBS inválido o expirado" },
      { status: 403 }
    );
  }

  const serverHash = computeElementsHash(board.elements);
  if (clientHash && clientHash === serverHash) {
    return NextResponse.json(
      { unchanged: true, hash: serverHash },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  return NextResponse.json(
    { board, hash: serverHash },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
