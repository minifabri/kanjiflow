"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, authMode, createSessionToken, passwordHash } from "@/server/auth/session";

export type LoginState = { error: string } | null;

// Limitazione dei tentativi (in memoria, per istanza): sufficiente per un'app personale.
const failures = new Map<string, { count: number; until: number }>();

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (authMode() !== "enabled") return { error: "Autenticazione non configurata." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const f = failures.get(ip);
  if (f && f.until > Date.now()) {
    return { error: `Troppi tentativi. Riprova tra ${Math.ceil((f.until - Date.now()) / 1000)} secondi.` };
  }
  const password = String(formData.get("password") ?? "");
  const ok = password.length > 0 && password.length <= 200 && (await bcrypt.compare(password, passwordHash()!));
  if (!ok) {
    const count = (f?.count ?? 0) + 1;
    failures.set(ip, { count, until: count >= 5 ? Date.now() + Math.min(15 * 60_000, 2 ** (count - 5) * 30_000) : 0 });
    return { error: "Password non corretta." };
  }
  failures.delete(ip);
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
