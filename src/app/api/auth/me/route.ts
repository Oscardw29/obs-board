import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAppMode } from "@/lib/config";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    user,
    mode: getAppMode(),
  });
}
