/**
 * Gestione degli account: solo l'amministratore crea, reimposta e disattiva; ognuno cambia la propria password.
 * Nessuna registrazione aperta. Disattivare o cambiare password incrementa sessionVersion (logout ovunque).
 */
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { MIN_PASSWORD_LENGTH, USERNAME_RE, normalizeUsername } from "@/server/auth/session";

export class AccountError extends Error {}

const BCRYPT_ROUNDS = 12;

/** Password temporanea leggibile (senza caratteri ambigui), da comunicare all'amico. */
export function temporaryPassword(length = 14) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function checkPassword(pw: string) {
  if (pw.length < MIN_PASSWORD_LENGTH) throw new AccountError(`La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`);
  if (pw.length > 200) throw new AccountError("Password troppo lunga.");
}

export async function createAccount(prisma: PrismaClient, input: { username: string; displayName: string; password?: string }) {
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) {
    throw new AccountError("Nome utente: 2–32 caratteri tra lettere minuscole, numeri, punto, trattino e trattino basso.");
  }
  if (await prisma.user.findUnique({ where: { username } })) throw new AccountError("Nome utente già in uso.");
  const password = input.password?.trim() || temporaryPassword();
  checkPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      displayName: input.displayName.trim().slice(0, 60) || username,
      role: "member",
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      settings: { create: {} },
    },
  });
  return { id: user.id, username, password };
}

export async function resetPassword(prisma: PrismaClient, userId: string) {
  const password = temporaryPassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), sessionVersion: { increment: 1 } },
  });
  return password;
}

export async function setDisabled(prisma: PrismaClient, actorId: string, userId: string, disabled: boolean) {
  if (actorId === userId) throw new AccountError("Non puoi disattivare il tuo account.");
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === "admin") throw new AccountError("L'account amministratore non si può disattivare.");
  await prisma.user.update({
    where: { id: userId },
    data: { disabledAt: disabled ? new Date() : null, sessionVersion: { increment: 1 } },
  });
}

export async function changeOwnPassword(prisma: PrismaClient, userId: string, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) throw new AccountError("La password attuale non è corretta.");
  checkPassword(next);
  if (next === current) throw new AccountError("La nuova password è uguale a quella attuale.");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS), sessionVersion: { increment: 1 } },
  });
  return updated.sessionVersion;
}

export async function listAccounts(prisma: PrismaClient) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, displayName: true, role: true, disabledAt: true, lastLoginAt: true, createdAt: true, _count: { select: { progress: true } } },
  });
  return users.map((u) => ({ ...u, studied: u._count.progress }));
}
