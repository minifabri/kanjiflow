"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, authMode, createSessionToken, normalizeUsername } from "@/server/auth/session";

export type LoginState = { error: string; username?: string } | null;

// Limitazione dei tentativi (in memoria, per istanza), per IP e per nome utente: sufficiente per pochi utenti.
const failures = new Map<string, { count: number; until: number }>();
// Hash fittizio: con un utente inesistente si spende lo stesso tempo, così non si capisce quali nomi esistono.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5H7i1ZJ0a3DqZ9jQ3g9XvJxZ7Q1lH6a";

function blocked(key: string) {
  const f = failures.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function fail(key: string) {
  const f = failures.get(key);
  const count = (f?.count ?? 0) + 1;
  failures.set(key, { count, until: count >= 5 ? Date.now() + Math.min(15 * 60_000, 2 ** (count - 5) * 30_000) : 0 });
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (authMode() !== "enabled") return { error: "Autenticazione non configurata." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const username = normalizeUsername(String(formData.get("username") ?? "")).slice(0, 64);
  const password = String(formData.get("password") ?? "");
  const keys = [`ip:${ip}`, `u:${username}`];
  const wait = Math.max(...keys.map(blocked));
  if (wait > 0) return { error: `Troppi tentativi. Riprova tra ${wait} secondi.`, username };

  const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
  const valid = password.length > 0 && password.length <= 200 && (await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH));
  if (!user || !user.passwordHash || !valid || user.disabledAt) {
    keys.forEach(fail);
    return { error: "Nome utente o password non corretti.", username };
  }
  keys.forEach((k) => failures.delete(k));
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(SESSION_COOKIE, await createSessionToken({ userId: user.id, version: user.sessionVersion }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
