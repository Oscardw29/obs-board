"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Mail,
  Radio,
  Sparkles,
  User as UserIcon,
  Video,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { LoginSceneBackground } from "@/components/LoginSceneBackground";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const REMEMBER_EMAIL_KEY = "oboards_remember_email";

function getPasswordStrength(pw: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!pw) return { score: 0, label: "", color: "bg-studio-800" };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) || /[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: "Débil", color: "bg-rose-500" };
  if (score === 2) return { score: 2, label: "Media", color: "bg-amber-400" };
  if (score === 3) return { score: 3, label: "Buena", color: "bg-sky-400" };
  return { score: 4, label: "Fuerte", color: "bg-emerald-400" };
}

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"local" | "cloud">("local");
  const [missingCloudEnv, setMissingCloudEnv] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      // ignore
    }

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(
        (data: {
          user?: unknown;
          mode?: "local" | "cloud";
          missingCloudEnv?: boolean;
        }) => {
          if (data.mode) setMode(data.mode);
          if (data.missingCloudEnv) setMissingCloudEnv(true);
          if (data.user) router.replace("/");
        }
      )
      .catch(() => {});
  }, [router]);

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      try {
        if (rememberEmail && email.trim()) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch {
        // ignore
      }

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
      window.location.href = "/";
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
          email: "demo@oboards.local",
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

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Ingresa tu correo electrónico primero para enviar el enlace de recuperación.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/auth/callback` }
      );
      if (resetErr) setError(resetErr.message);
      else {
        setInfo(
          "Enviamos un enlace de recuperación a tu correo electrónico."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <LoginSceneBackground />

      <div className="relative z-10 w-full max-w-4xl grid md:grid-cols-12 gap-8 items-center">
        {/* Left brand panel */}
        <div className="md:col-span-6 space-y-6 px-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-studio-900/90 border border-white/[0.1] text-sky-300 text-xs font-medium backdrop-blur-md shadow-lg">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>
              {mode === "cloud"
                ? "Modo Nube · Sincronización en Vivo"
                : "Modo Local Instantáneo · Listo para OBS"}
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="leading-none">
              <BrandLogo size="xl" />
            </h1>
            <p className="text-zinc-300 text-base leading-relaxed text-pretty">
              Tablero colaborativo en tiempo real diseñado para proyectarse como
              fuente transparente de{" "}
              <span className="text-white font-semibold">OBS Studio</span>.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-studio-900/65 border border-white/[0.08] backdrop-blur-md">
              <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-400/25 text-sky-300 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  Salida 1920×1080 transparente y sin UI
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Cero marcos ni cursores en directo. Modera permisos, pausa o
                  anima cada capa en vivo.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-studio-900/65 border border-white/[0.08] backdrop-blur-md">
              <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-400/25 text-sky-300 shrink-0">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  Biblioteca compartida en carpetas y documentos
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Organiza clips MP4/WebM, imágenes, fuentes y páginas PDF para
                  todo tu equipo.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Auth Card */}
        <div className="md:col-span-6 bg-studio-900/88 border border-white/[0.11] rounded-3xl p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          {/* Animated sliding tab switcher */}
          <div className="relative grid grid-cols-2 rounded-xl bg-studio-950/90 p-1 mb-6 border border-white/[0.08]">
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-sky-600 shadow-lg shadow-sky-600/25 transition-transform duration-200 ease-out"
              style={{
                transform:
                  tab === "login" ? "translateX(0%)" : "translateX(calc(100% + 4px))",
              }}
            />
            <button
              type="button"
              onClick={() => {
                setTab("login");
                setError(null);
              }}
              className={`relative z-10 py-2 text-sm font-semibold rounded-lg transition-colors ${
                tab === "login"
                  ? "text-white"
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
              className={`relative z-10 py-2 text-sm font-semibold rounded-lg transition-colors ${
                tab === "register"
                  ? "text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Crear cuenta
            </button>
          </div>

          {missingCloudEnv && (
            <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200 leading-relaxed">
              Esta app está en Vercel pero no detecta las variables de Supabase (
              <code className="text-amber-100">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
              <code className="text-amber-100">
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
              </code>
              ). Verifica <strong>Vercel → Settings → Environment Variables</strong>{" "}
              y haz <strong>Redeploy</strong>.
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-4 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200"
            >
              {error}
            </div>
          )}

          {info && (
            <div
              aria-live="polite"
              className="mb-4 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200"
            >
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "register" && (
              <div className="animate-panel-enter">
                <label
                  htmlFor="login-name"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Nombre o alias
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    spellCheck={false}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Oscar / Mod…"
                    className="w-full rounded-xl bg-studio-950/90 border border-white/[0.09] pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full rounded-xl bg-studio-950/90 border border-white/[0.09] pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="text-xs font-medium text-zinc-300"
                >
                  Contraseña
                </label>
                {tab === "login" && mode === "cloud" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres…"
                  className="w-full rounded-xl bg-studio-950/90 border border-white/[0.09] pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {tab === "register" && password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((lvl) => (
                      <div
                        key={lvl}
                        className={`h-1 rounded-full transition-colors ${
                          pwStrength.score >= lvl
                            ? pwStrength.color
                            : "bg-studio-800"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Seguridad:{" "}
                    <span className="text-zinc-200 font-medium">
                      {pwStrength.label}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {tab === "login" && (
              <button
                type="button"
                onClick={() => setRememberEmail((v) => !v)}
                className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    rememberEmail
                      ? "bg-sky-500 border-sky-400 text-white"
                      : "bg-studio-950 border-white/20"
                  }`}
                >
                  {rememberEmail && <Check className="w-3 h-3" />}
                </span>
                <span>Recordar mi correo</span>
              </button>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors shadow-lg shadow-sky-600/25 active:scale-[0.99]"
            >
              {loading
                ? "Procesando…"
                : tab === "login"
                  ? "Entrar a mis tableros"
                  : "Crear cuenta y entrar"}
            </button>
          </form>

          {mode === "cloud" ? (
            <div className="mt-5 pt-5 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={handleGoogleOAuth}
                className="w-full py-2.5 px-4 rounded-xl bg-studio-850 hover:bg-studio-800 border border-white/[0.1] text-zinc-100 text-sm font-medium inline-flex items-center justify-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-2H12z"
                  />
                </svg>
                <span>Continuar con Google</span>
              </button>
            </div>
          ) : !missingCloudEnv ? (
            <div className="mt-5 pt-5 border-t border-white/[0.08] space-y-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={handleDemoLogin}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>Entrar rápido como Streamer Demo</span>
              </button>
              <p className="text-[11px] text-center text-zinc-500">
                Cuenta demo:{" "}
                <code className="text-zinc-300">demo@oboards.local</code> /{" "}
                <code className="text-zinc-300">demo1234</code>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
