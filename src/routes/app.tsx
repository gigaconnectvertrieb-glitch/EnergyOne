import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CalendarDays, House, ListChecks, Map, UserRound } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BrandMark } from "@/components/logo";
import { OfflineBar } from "@/components/offline-bar";
import { ServerLive } from "@/components/server-live";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "E1 Tour" },
      { name: "theme-color", content: "#0B0D12" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "E1 Tour" },
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
  { to: "/app/karte", label: "Routing", icon: Map },
  { to: "/app", label: "Dashboard", icon: House, exact: true },
  { to: "/app/abschluss", label: "Buchen", icon: CalendarDays },
  { to: "/app/liste", label: "Leads", icon: ListChecks },
  { to: "/app/bs", label: "BS", icon: UserRound },
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
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/6 bg-[#07080c] px-4 pt-[env(safe-area-inset-top)]">
        <BrandMark className="h-7 w-auto" />
        <p className="hidden font-display text-[15px] text-gold sm:block">E1 Tour</p>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {TABS.map((t) => {
            const on = "exact" in t && t.exact ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to} className={cn("rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.14em]", on ? "bg-gold text-bg" : "text-muted")}>
                {t.label}
              </Link>
            );
          })}
          <Link to="/app/bilanz" className={cn("rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.14em]", pathname.startsWith("/app/bilanz") ? "bg-gold text-bg" : "text-muted")}>
            Reporting
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ServerLive />
          <Link to="/app/mehr" className="text-[11px] text-gold">
            Mehr
          </Link>
        </div>
      </header>
      <div className="px-4 pt-2">
        <OfflineBar />
      </div>
      <main className={pathname.startsWith("/app/karte") ? "pb-24 md:pb-4" : "px-4 pb-24 pt-4 md:pb-8"}>
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/8 bg-[#0b0d12]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        {TABS.map((t) => {
          const on = "exact" in t && t.exact ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(t.to);
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
