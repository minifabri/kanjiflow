/**
 * Autenticazione a password singola (deploy privato, un solo utente).
 *
 * - APP_PASSWORD_HASH_B64: hash bcrypt della password, codificato in base64 (`npm run auth:hash -- "la-tua-password"`).
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
