import { describe, expect, it } from "vitest";
import { authMode, passwordHash } from "./session";

const HASH = "$2b$10$Tpw.1YR6MitQx6Pantmv4OjhBRh6f0M3buKToAcxLSQnFNYDJHGoS";
const B64 = Buffer.from(HASH).toString("base64");
const SECRET = "x".repeat(32);

describe("configurazione autenticazione", () => {
  it("disattivata in sviluppo senza hash", () => {
    expect(authMode({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("disabled");
  });
  it("fail closed in produzione senza configurazione", () => {
    expect(authMode({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("misconfigured");
    expect(authMode({ NODE_ENV: "production", APP_PASSWORD_HASH_B64: B64 } as NodeJS.ProcessEnv)).toBe("misconfigured");
  });
  it("attiva con hash base64 e segreto", () => {
    const env = { NODE_ENV: "production", APP_PASSWORD_HASH_B64: B64, SESSION_SECRET: SECRET } as NodeJS.ProcessEnv;
    expect(authMode(env)).toBe("enabled");
    expect(passwordHash(env)).toBe(HASH);
  });
  it("un hash corrotto (es. '$' espansi) non attiva l'accesso", () => {
    const env = { NODE_ENV: "development", APP_PASSWORD_HASH: ".1YR6MitQx6Pantmv4OjhBRh6f0M3buKToAcxLSQnFNYDJHGoS", SESSION_SECRET: SECRET } as NodeJS.ProcessEnv;
    expect(passwordHash(env)).toBeNull();
    expect(authMode(env)).toBe("misconfigured");
  });
});

describe("token di sessione", () => {
  it("porta utente e versione, e rifiuta firme diverse e i vecchi token a utente unico", async () => {
    process.env.SESSION_SECRET = "s".repeat(40);
    const { createSessionToken, verifySessionToken } = await import("./session");
    const { SignJWT } = await import("jose");
    const t = await createSessionToken({ userId: "u1", version: 3 });
    expect(await verifySessionToken(t)).toEqual({ userId: "u1", version: 3 });
    expect(await verifySessionToken(t.slice(0, -2) + "xx")).toBeNull();
    const legacy = await new SignJWT({ sub: "owner" }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    expect(await verifySessionToken(legacy)).toBeNull();
    process.env.SESSION_SECRET = "t".repeat(40);
    expect(await verifySessionToken(t)).toBeNull();
  });

  it("valida i nomi utente", async () => {
    const { USERNAME_RE, normalizeUsername } = await import("./session");
    expect(USERNAME_RE.test(normalizeUsername(" Marco.R "))).toBe(true);
    expect(USERNAME_RE.test("a")).toBe(false);
    expect(USERNAME_RE.test("ma rco")).toBe(false);
    expect(USERNAME_RE.test("-marco")).toBe(false);
  });
});
