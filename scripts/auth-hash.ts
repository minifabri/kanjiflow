/** Uso: npm run auth:hash -- "password"  → stampa l'hash bcrypt da mettere in APP_PASSWORD_HASH_B64. */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error("Passa una password di almeno 10 caratteri: npm run auth:hash -- \"...\"");
  process.exit(1);
}
// Base64: il caricatore di variabili di Next.js espande i "$" e corromperebbe l'hash bcrypt in chiaro.
console.log(`APP_PASSWORD_HASH_B64=${Buffer.from(bcrypt.hashSync(password, 12)).toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
