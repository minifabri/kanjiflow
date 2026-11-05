/** Uso: npm run auth:hash -- "password"  → stampa l'hash bcrypt da mettere in APP_PASSWORD_HASH. */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error("Passa una password di almeno 10 caratteri: npm run auth:hash -- \"...\"");
  process.exit(1);
}
console.log(`APP_PASSWORD_HASH='${bcrypt.hashSync(password, 12)}'`);
console.log(`SESSION_SECRET='${randomBytes(32).toString("base64url")}'`);
