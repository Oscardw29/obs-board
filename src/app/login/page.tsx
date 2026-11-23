"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  Lock,
  Mail,
  Radio,
  Sparkles,
  User as UserIcon,
  Video,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"local" | "cloud">("local");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user?: unknown; mode?: "local" | "cloud" }) => {
        if (data.mode) setMode(data.mode);
        if (data.user) router.replace("/");
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const endpoint =
        tab === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        needsEmailConfirmation?: boolean;
      };
      if (!res.ok) {
        setError(data.error || "No se pudo completar la operación.");
        return;
      }
      if (data.needsEmailConfirmation) {
        setInfo(
          "Cuenta creada. Revisa tu correo electrónico para confirmar tu cuenta antes de iniciar sesión."
        );
        setTab("login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "demo@obsboard.local",
          password: "demo1234",
        }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("No se pudo iniciar la sesión demo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleOAuth = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle studio ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[420px] rounded-full bg-indigo-600/15 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 w-[480px] h-[360px] rounded-full bg-fuchsia-600/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">
        {/* Left brand panel */}
        <div className="space-y-6 px-2">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-medium">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>
              {mode === "cloud"
                ? "Modo Nube (Supabase Realtime)"
                : "Modo Local Instantáneo • Listo para OBS"}
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              OBS<span className="text-indigo-400">Board</span>
            </h1>
            <p className="text-zinc-400 text-base leading-relaxed">
              Tablero colaborativo en tiempo real estilo Excalidraw diseñado para
              integrarse como fuente transparente en{" "}
              <span className="text-zinc-200 font-medium">OBS Studio</span>.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-studio-850 border border-studio-700 text-indigo-400 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Salida 1920×1080 transparente y sin UI
                </p>
                <p className="text-xs text-zinc-400">
                  Sin cajas de selección, barras ni cursores en directo. Solo tu
                  contenido.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-studio-850 border border-studio-700 text-fuchsia-400 shrink-0">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Biblioteca de clips y memes MP4/WebM
                </p>
                <p className="text-xs text-zinc-400">
                  Importa una sola vez y dispara videos con audio, loop o
                  auto-ocultado en vivo.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-studio-850 border border-studio-700 text-emerald-400 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Colaboración privada por invitación
                </p>
                <p className="text-xs text-zinc-400">
                  Solo las cuentas que autorices pueden dibujar o lanzar clips en
                  tus tableros.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="bg-studio-900/95 border border-studio-700/80 rounded-2xl p-6 shadow-2xl backdrop-blur">
          <div className="flex rounded-xl bg-studio-950 p-1 mb-6 border border-studio-800">
            <button
              type="button"
              onClick={() => {
                setTab("login");
                setError(null);
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                tab === "login"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("register");
                setError(null);
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                tab === "register"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Crear cuenta
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
              {error}
            </div>
          )}

          {info && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "register" && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nombre o alias
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Oscar / Mod"
                    className="w-full rounded-xl bg-studio-950 border border-studio-700 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full rounded-xl bg-studio-950 border border-studio-700 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-xl bg-studio-950 border border-studio-700 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20"
            >
              {loading
                ? "Procesando..."
                : tab === "login"
                  ? "Entrar a mis tableros"
                  : "Crear cuenta y entrar"}
            </button>
          </form>

          {mode === "cloud" ? (
            <div className="mt-4 pt-4 border-t border-studio-800">
              <button
                type="button"
                onClick={handleGoogleOAuth}
                className="w-full py-2.5 rounded-xl bg-studio-850 hover:bg-studio-800 border border-studio-700 text-zinc-200 text-sm font-medium transition"
              >
                Continuar con Google
              </button>
            </div>
          ) : (
            <div className="mt-5 pt-5 border-t border-studio-800 space-y-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={handleDemoLogin}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center justify-center gap-2 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Entrar rápido como Streamer Demo</span>
              </button>
              <p className="text-[11px] text-center text-zinc-500">
                Cuenta demo: <code className="text-zinc-300">demo@obsboard.local</code> /{" "}
                <code className="text-zinc-300">demo1234</code>. También puedes crear
                cuentas adicionales para probar invitaciones.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
