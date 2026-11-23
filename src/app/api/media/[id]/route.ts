import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteMediaAsset, updateMediaAsset } from "@/lib/store";

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
    tags?: string[];
  };
  const res = await updateMediaAsset(user, id, body);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true, asset: res.asset });
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
  const res = await deleteMediaAsset(user, id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
