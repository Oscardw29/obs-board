import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAppMode,
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "@/lib/config";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    user,
    mode: getAppMode(),
    missingCloudEnv: Boolean(process.env.VERCEL && !isSupabaseConfigured()),
    hasUrl: Boolean(getSupabaseUrl()),
    hasKey: Boolean(getSupabasePublishableKey()),
  });
}
