import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { nanoid } from "nanoid";
import type { User } from "@/types/board";
import { getAuthSecret, isSupabaseConfigured } from "./config";
import { pickAvatarColor } from "./geometry";
import {
  hashPassword,
  mutateLocalDb,
  readLocalDb,
  verifyPassword,
} from "./local-db";
import { getSupabaseServerClient } from "./supabase/server";

const SESSION_COOKIE = "obsboard_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function signToken(payload: string): string {
  const hmac = crypto
    .createHmac("sha256", getAuthSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${hmac}`;
}

function verifyToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", getAuthSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  return payload;
}

export async function setLocalSessionCookie(userId: string): Promise<void> {
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString(
    "base64url"
  );
  const signed = signToken(payload);
  const cookieStore = await cookies();
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") || "";
  const isSecure = proto === "https" || process.env.FORCE_SECURE_COOKIES === "true";
  cookieStore.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function clearLocalSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) return null;
    const displayName =
      (user.user_metadata?.name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email.split("@")[0];
    return {
      id: user.id,
      email: user.email.toLowerCase(),
      name: displayName,
      avatarColor: pickAvatarColor(user.email),
      createdAt: user.created_at,
    };
  }

  // Local mode session cookie
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = verifyToken(raw);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { uid?: string; exp?: number };
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) return null;

    const db = readLocalDb();
    const record = db.users.find((u) => u.id === parsed.uid);
    if (!record) return null;

    return {
      id: record.id,
      email: record.email,
      name: record.name,
      avatarColor: record.avatarColor,
      createdAt: record.createdAt,
    };
  } catch {
    return null;
  }
}

export async function registerLocalUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ user?: User; error?: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email.split("@")[0];
  const password = input.password;

  if (!email || !email.includes("@")) {
    return { error: "Ingresa un correo electrónico válido." };
  }
  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  return mutateLocalDb((db) => {
    const existing = db.users.find((u) => u.email.toLowerCase() === email);
    if (existing) {
      return { error: "Ya existe una cuenta registrada con ese correo." };
    }
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();
    const newUser = {
      id: `usr_${nanoid(12)}`,
      email,
      name,
      avatarColor: pickAvatarColor(email),
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: now,
    };
    db.users.push(newUser);

    // Link any pending invitations for this email
    for (const member of db.members) {
      if (member.email.toLowerCase() === email) {
        member.userId = newUser.id;
        member.name = newUser.name;
      }
    }

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        avatarColor: newUser.avatarColor,
        createdAt: newUser.createdAt,
      },
    };
  });
}

export async function loginLocalUser(input: {
  email: string;
  password: string;
}): Promise<{ user?: User; error?: string }> {
  let email = input.email.trim().toLowerCase();
  const db = readLocalDb();
  let record = db.users.find((u) => u.email.toLowerCase() === email);
  if (!record && (email === "demo@oboards.local" || email === "demo@obsboard.local")) {
    record = db.users.find((u) => u.id === "user_demo_streamer");
    if (record) email = record.email.toLowerCase();
  }
  if (!record) {
    return { error: "Correo o contraseña incorrectos." };
  }
  if (!verifyPassword(input.password, record.passwordSalt, record.passwordHash)) {
    return { error: "Correo o contraseña incorrectos." };
  }
  return {
    user: {
      id: record.id,
      email: record.email,
      name: record.name,
      avatarColor: record.avatarColor,
      createdAt: record.createdAt,
    },
  };
}
