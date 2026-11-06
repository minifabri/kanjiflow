/**
 * Autenticazione per account (pochi utenti invitati dall'amministratore, nessuna registrazione aperta).
 *
 * - Ogni utente ha nome di accesso e password (hash bcrypt nel database).
 * - APP_PASSWORD_HASH_B64: password iniziale dell'amministratore, copiata nel suo account al primo avvio
 *   (`npm run auth:hash -- "la-tua-password"`). Serve anche da interruttore: senza, in produzione l'app è chiusa.
 *   Il base64 evita che il caricatore di variabili di Next.js espanda i "$" dell'hash bcrypt (lo corromperebbe).
 *   È accettato anche APP_PASSWORD_HASH in chiaro, ma solo se i "$" sono preceduti da "\".
 * - SESSION_SECRET: segreto ≥ 32 caratteri per firmare il cookie di sessione (JWT HS256).
 * - In sviluppo locale, senza hash configurato, l'autenticazione è disattivata.
 * - In produzione, senza hash valido o SESSION_SECRET l'app rifiuta ogni richiesta (fail closed).
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kf_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

export type AuthMode = "disabled" | "enabled" | "misconfigured";

export function passwordHash(env: NodeJS.ProcessEnv = process.env): string | null {
  const b64 = env.APP_PASSWORD_HASH_B64?.trim();
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    return /^\$2[aby]\$\d{2}\$.{53}$/.test(decoded) ? decoded : null;
  }
  const raw = env.APP_PASSWORD_HASH?.trim();
  return raw && /^\$2[aby]\$\d{2}\$.{53}$/.test(raw) ? raw : null;
}

export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const configured = !!(env.APP_PASSWORD_HASH_B64?.trim() || env.APP_PASSWORD_HASH?.trim());
  const hasHash = !!passwordHash(env);
  const hasSecret = (env.SESSION_SECRET?.length ?? 0) >= 32;
  if (hasHash && hasSecret) return "enabled";
  if (env.NODE_ENV === "production" || configured) return "misconfigured";
  return "disabled";
}

function secretKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET ?? "");
}

export interface SessionClaims {
  userId: string;
  version: number;
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ v: claims.version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(secretKey());
}

/** Verifica solo firma e scadenza; disattivazione e cambio password si controllano sul database (sessionVersion). */
export async function verifySessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub === "owner" || typeof payload.v !== "number") return null;
    return { userId: payload.sub, version: payload.v };
  } catch {
    return null;
  }
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}
export const MIN_PASSWORD_LENGTH = 10;
