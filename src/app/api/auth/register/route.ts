import { NextResponse } from "next/server";
import { registerLocalUser, setLocalSessionCookie } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    const name = (body.name ?? "").trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Completa correo y contraseña." },
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name || email.split("@")[0] },
        },
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        needsEmailConfirmation: !data.session,
      });
    }

    const result = await registerLocalUser({ email, password, name });
    if (result.error || !result.user) {
      return NextResponse.json(
        { error: result.error ?? "No se pudo crear la cuenta." },
        { status: 400 }
      );
    }

    await setLocalSessionCookie(result.user.id);
    return NextResponse.json({ ok: true, user: result.user });
  } catch {
    return NextResponse.json(
      { error: "Error procesando el registro." },
      { status: 400 }
    );
  }
}
