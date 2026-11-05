"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Compass,
  FolderHeart,
  GraduationCap,
  LayoutDashboard,
  RefreshCw,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/lessons", label: "Lezioni", icon: BookOpen, mobile: true },
  { href: "/reviews", label: "Ripassi", icon: RefreshCw, mobile: true },
  { href: "/subjects", label: "Esplora", icon: Compass, mobile: true },
  { href: "/jlpt", label: "JLPT", icon: GraduationCap },
  { href: "/statistics", label: "Statistiche", icon: BarChart3 },
  { href: "/collections", label: "Raccolte", icon: FolderHeart },
  { href: "/settings", label: "Impostazioni", icon: Settings, mobile: true },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children, badge }: { children: React.ReactNode; badge: string }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary">
        Vai al contenuto
      </a>
      {/* Barra laterale (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border/60 bg-surface/40 px-3 py-5 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="KanjiFlow, dashboard">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">KanjiFlow</span>
          </Link>
        </div>
        <nav aria-label="Navigazione principale" className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-foreground",
                  active && "bg-elevated text-foreground",
                )}
              >
                <item.icon className={cn("size-4", active && "text-primary")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pt-4">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">{badge}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Intestazione (mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2.5" aria-label="KanjiFlow, dashboard">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">KanjiFlow</span>
          </Link>
          <span className="rounded-full bg-elevated px-2.5 py-1 text-xs text-foreground">{badge}</span>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8">
          {children}
        </main>

        {/* Barra di navigazione inferiore (mobile) */}
        <nav
          aria-label="Navigazione principale"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/60 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {NAV.filter((n) => n.mobile).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted", active && "text-foreground")}
              >
                <item.icon className={cn("size-5", active && "text-primary")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
