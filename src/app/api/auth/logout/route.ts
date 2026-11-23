import { NextResponse } from "next/server";
import { clearLocalSessionCookie } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  } else {
    await clearLocalSessionCookie();
  }
  return NextResponse.json({ ok: true });
}
