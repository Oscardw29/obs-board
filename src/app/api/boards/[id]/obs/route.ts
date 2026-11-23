import { NextResponse } from "next/server";
import { getBoardForObs } from "@/lib/store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const board = await getBoardForObs(id, token);

  if (!board) {
    return NextResponse.json(
      { error: "Enlace OBS inválido o expirado" },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { board },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
