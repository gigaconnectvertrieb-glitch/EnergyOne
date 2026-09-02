import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CalendarDays, ListChecks, Map, Wallet } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BrandMark } from "@/components/logo";
import { GoalStrip } from "@/components/goal-card";
import { OfflineBar } from "@/components/offline-bar";
import { WorkShift } from "@/components/work-shift";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "E1 Feld" },
      { name: "theme-color", content: "#0B0D12" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "E1 Feld" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/app.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  component: AppShell,
});

const TABS = [
  { to: "/app", label: "Route", icon: Map },
  { to: "/app/abschluss", label: "Abschluss", icon: CalendarDays },
  { to: "/app/bilanz", label: "Bilanz", icon: Wallet },
  { to: "/app/liste", label: "Nachlauf", icon: ListChecks },
] as const;

function AppShell() {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  if (pathname.startsWith("/app/login")) return <Outlet />;
  if (isPending) return <div className="grid min-h-dvh place-items-center bg-bg text-muted">Laden…</div>;
  if (!user) return <RedirectToSignIn to="/app/login" />;
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2.5 border-b border-white/5 bg-bg/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <BrandMark className="h-7 w-auto" />
        <p className="font-display text-base tracking-wide text-gold">Feld</p>
        <div className="ml-auto flex items-center gap-2">
          <WorkShift />
          <Link to="/app/mehr" className="text-xs text-muted">
            Mehr
          </Link>
        </div>
      </header>
      {pathname.startsWith("/app/mehr") ? null : <GoalStrip />}
      <div className="px-4 pt-2">
        <OfflineBar />
      </div>
      <main className="px-4 pb-24 pt-3">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-white/8 bg-[#0b0d12]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        {TABS.map((t) => {
          const on = t.to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "relative flex min-h-[3.75rem] flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted",
                on && "text-gold",
              )}
            >
              {on ? <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-gold" /> : null}
              <t.icon className="size-5" strokeWidth={on ? 2.2 : 1.6} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
