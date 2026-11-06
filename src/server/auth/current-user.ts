import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { ensureOwner } from "@/server/user";
import { SESSION_COOKIE, authMode, verifySessionToken } from "./session";

export interface CurrentUser {
  id: string;
  username: string | null;
  displayName: string;
  role: string;
}

/**
 * Utente della richiesta. Senza autenticazione (solo sviluppo locale) è il proprietario.
 * Con autenticazione: sessione valida, account attivo e sessionVersion coincidente, altrimenti al login.
 */
export async function currentUser(): Promise<CurrentUser> {
  if (authMode() === "disabled") {
    const id = await ensureOwner(prisma);
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
  }
  const claims = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const u = claims ? await prisma.user.findUnique({ where: { id: claims.userId } }) : null;
  if (!u || u.disabledAt || u.sessionVersion !== claims!.version) redirect("/login");
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await currentUser();
  if (u.role !== "admin") throw new Error("Operazione riservata all'amministratore");
  return u;
}
