import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CalendarDays, ListChecks, Map, MoreHorizontal } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BrandMark } from "@/components/logo";
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
  { to: "/app", label: "Heute", icon: CalendarDays },
  { to: "/app/karte", label: "Karte", icon: Map },
  { to: "/app/liste", label: "Liste", icon: ListChecks },
  { to: "/app/mehr", label: "Mehr", icon: MoreHorizontal },
] as const;

function AppShell() {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (isPending) return <div className="grid min-h-dvh place-items-center bg-bg text-muted">Laden…</div>;
  if (!user) return <RedirectToSignIn />;
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <BrandMark className="h-9 w-auto" />
        <div className="leading-tight">
          <p className="font-display text-lg text-gold">E1 Feld</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Direktvertrieb</p>
        </div>
      </header>
      <main className="px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {TABS.map((t) => {
          const on = t.to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted",
                on && "text-gold",
              )}
            >
              <t.icon className="size-5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
