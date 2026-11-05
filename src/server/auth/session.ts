/**
 * Autenticazione a password singola (deploy privato, un solo utente).
 *
 * - APP_PASSWORD_HASH: hash bcrypt della password (`npm run auth:hash -- "la-tua-password"`).
 * - SESSION_SECRET: segreto ≥ 32 caratteri per firmare il cookie di sessione (JWT HS256).
 * - In sviluppo locale, senza APP_PASSWORD_HASH, l'autenticazione è disattivata.
 * - In produzione, senza APP_PASSWORD_HASH o SESSION_SECRET l'app rifiuta ogni richiesta (fail closed).
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kf_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

export type AuthMode = "disabled" | "enabled" | "misconfigured";

export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const hasHash = !!env.APP_PASSWORD_HASH?.trim();
  const hasSecret = (env.SESSION_SECRET?.length ?? 0) >= 32;
  if (hasHash && hasSecret) return "enabled";
  if (env.NODE_ENV === "production") return "misconfigured";
  return hasHash ? "misconfigured" : "disabled";
}

function secretKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET ?? "");
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub === "owner";
  } catch {
    return false;
  }
}
