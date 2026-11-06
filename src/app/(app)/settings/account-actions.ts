"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { currentUser, requireAdmin } from "@/server/auth/current-user";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, createSessionToken } from "@/server/auth/session";
import { AccountError, changeOwnPassword, createAccount, resetPassword, setDisabled } from "@/server/accounts";

export type AccountResult = { ok: true; message: string; secret?: { username: string; password: string } } | { ok: false; error: string };

async function guard(fn: () => Promise<AccountResult>): Promise<AccountResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Dati non validi." };
    throw e;
  }
}

export async function createAccountAction(input: { username: string; displayName: string }): Promise<AccountResult> {
  return guard(async () => {
    await requireAdmin();
    const data = z.object({ username: z.string().max(64), displayName: z.string().max(60) }).parse(input);
    const r = await createAccount(prisma, data);
    revalidatePath("/settings/accounts");
    return { ok: true, message: "Account creato.", secret: { username: r.username, password: r.password } };
  });
}

export async function resetPasswordAction(userId: string): Promise<AccountResult> {
  return guard(async () => {
    await requireAdmin();
    const target = await prisma.user.findUniqueOrThrow({ where: { id: z.string().min(1).parse(userId) } });
    const password = await resetPassword(prisma, target.id);
    revalidatePath("/settings/accounts");
    return { ok: true, message: "Password reimpostata: le sessioni aperte sono state chiuse.", secret: { username: target.username ?? "", password } };
  });
}

export async function setDisabledAction(userId: string, disabled: boolean): Promise<AccountResult> {
  return guard(async () => {
    const admin = await requireAdmin();
    await setDisabled(prisma, admin.id, z.string().min(1).parse(userId), z.boolean().parse(disabled));
    revalidatePath("/settings/accounts");
    return { ok: true, message: disabled ? "Account disattivato." : "Account riattivato." };
  });
}

export async function changePasswordAction(input: { current: string; next: string }): Promise<AccountResult> {
  return guard(async () => {
    const me = await currentUser();
    const data = z.object({ current: z.string().max(200), next: z.string().max(200) }).parse(input);
    const version = await changeOwnPassword(prisma, me.id, data.current, data.next);
    // Le altre sessioni decadono; questa resta aperta con un cookie nuovo.
    (await cookies()).set(SESSION_COOKIE, await createSessionToken({ userId: me.id, version }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
    });
    return { ok: true, message: "Password cambiata. Le altre sessioni sono state chiuse." };
  });
}
