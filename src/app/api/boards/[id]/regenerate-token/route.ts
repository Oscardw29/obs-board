import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { regenerateObsToken } from "@/lib/store";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const res = await regenerateObsToken(id, user);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true, obsToken: res.obsToken });
}
