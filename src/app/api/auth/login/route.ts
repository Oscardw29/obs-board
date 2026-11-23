import { NextResponse } from "next/server";
import { loginLocalUser, setLocalSessionCookie } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Ingresa tu correo y contraseña." },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured()) {
      const supabase = await getSupabaseServerClient();
      if (!supabase) {
        return NextResponse.json(
          { error: "Supabase no configurado." },
          { status: 500 }
        );
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) {
        return NextResponse.json(
          { error: error?.message ?? "Credenciales inválidas." },
          { status: 401 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (process.env.VERCEL) {
      return NextResponse.json(
        {
          error:
            "Faltan las variables de Supabase en Vercel (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Agrégalas en Vercel -> Settings -> Environment Variables y haz Redeploy.",
        },
        { status: 500 }
      );
    }

    const result = await loginLocalUser({ email, password });
    if (result.error || !result.user) {
      return NextResponse.json(
        { error: result.error ?? "Credenciales inválidas." },
        { status: 401 }
      );
    }

    await setLocalSessionCookie(result.user.id);
    return NextResponse.json({ ok: true, user: result.user });
  } catch {
    return NextResponse.json(
      { error: "Error procesando el inicio de sesión." },
      { status: 400 }
    );
  }
}
