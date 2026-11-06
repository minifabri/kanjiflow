import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { getStudyContext } from "@/server/study/context";
import { prisma } from "@/server/db";
import { listAccounts } from "@/server/accounts";
import { AccountRowActions, CreateAccountForm } from "../account-forms";

export const metadata = { title: "Account" };

const fmt = (d: Date | null, tz: string) => (d ? d.toLocaleDateString("it-IT", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }) : "mai");

export default async function AccountsPage() {
  const ctx = await getStudyContext();
  if (ctx.role !== "admin") redirect("/settings");
  const accounts = await listAccounts(prisma);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Impostazioni
      </Link>
      <h1 className="text-2xl font-semibold">Account</h1>
      <Card>
        <CardHeader>
          <CardTitle>Nuovo account</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateAccountForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account esistenti</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {a.displayName}
                    <span className="font-mono text-sm text-muted">{a.username ?? "—"}</span>
                    {a.role === "admin" && <Badge variant="outline">amministratore</Badge>}
                    {a.id === ctx.userId && <Badge variant="outline">tu</Badge>}
                    {a.disabledAt && <Badge className="bg-error/15 text-error">disattivato</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    Creato il {fmt(a.createdAt, ctx.timeZone)} · ultimo accesso {fmt(a.lastLoginAt, ctx.timeZone)} · {a.studied} elementi studiati
                  </p>
                </div>
                <AccountRowActions userId={a.id} disabled={!!a.disabledAt} isSelf={a.id === ctx.userId} isAdmin={a.role === "admin"} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
