import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { authMode } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (authMode() === "disabled") redirect("/");
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="size-11" />
          <h1 className="text-xl font-semibold">KanjiFlow</h1>
          <p className="jp text-sm text-muted">おかえりなさい。</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
