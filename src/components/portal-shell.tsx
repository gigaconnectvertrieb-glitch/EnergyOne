/**
 * E1 Portal Shell – einheitlich für Feld + Büro
 * ------------------------------------------------
 * - Ein Login für alle
 * - Mitarbeiter: Heute, Aufträge, Kunden, Gebiete, Mehr
 * - Orhan + Super-Admin: zusätzlich Steuerung (Mitarbeiter, Gebiete aufspielen, Tarife, System)
 * - Übersichtlich, professionell, mobil tauglich
 *
 * Ersetzt: src/components/portal-shell.tsx
 */

import { Link, Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import {
  Bell,
  Briefcase,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
  Wallet,
  Mail,
  Map,
  BarChart3,
  ClipboardList,
  UserRound,
  Menu,
  Plus,
  Home,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootstrapMe } from "@/lib/server/api";
import type { Profile } from "@/lib/e1";
import { can, type Role } from "@/lib/e1";
import { Wordmark } from "./logo";
import { usePushWorker } from "./goal-card";
import { AppUpdate } from "./app-update";
import { ServerLive } from "./server-live";
import { OfflineBar } from "./offline-bar";
import { cn } from "@/lib/utils";

type MeState = {
  profile: Profile;
  flags: Record<string, boolean>;
  unread: number;
  mailUnread: number;
  require_2fa: boolean;
};

export function usePortalMe() {
  const [me, setMe] = useState<MeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    bootstrapMe()
      .then(setMe)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Fehler"));
  }, []);
  return { me, error, reload: () => bootstrapMe().then(setMe) };
}

/** Kern-Navigation – für alle Rollen */
function coreItems(role: Role, flags: Record<string, boolean>) {
  return [
    { to: "/portal", label: "Heute", icon: Home, exact: true },
    { to: "/portal/auftraege", label: "Aufträge", icon: ClipboardList },
    { to: "/portal/kunden", label: "Kunden", icon: Users },
    {
      to: "/portal/gebiete",
      label: "Gebiete",
      icon: Map,
      show: flags.field_routing !== false,
    },
    { to: "/portal/provisionen", label: "Provisionen", icon: Wallet },
    { to: "/portal/postfach", label: "Postfach", icon: Mail },
  ].filter((i) => i.show !== false);
}

/** Steuerung – nur Super-Admin / Leitung (Orhan + du) */
function adminItems(role: Role, flags: Record<string, boolean>) {
  if (role !== "super_admin" && role !== "gebietsleiter" && role !== "buchhaltung") {
    return [];
  }
  return [
    {
      to: "/portal/admin/benutzer",
      label: "Mitarbeiter",
      icon: Shield,
      show: can(role, "users.manage") || can(role, "team.view"),
    },
    {
      to: "/portal/gebiete",
      label: "Gebiete aufspielen",
      icon: Map,
      show: can(role, "team.view"),
      hint: "Straßen zuweisen",
    },
    {
      to: "/portal/admin/produkte",
      label: "Tarife",
      icon: Briefcase,
      show: can(role, "products.manage") || can(role, "contracts.view_all"),
    },
    {
      to: "/portal/team",
      label: "Team",
      icon: UserRound,
      show: can(role, "team.view"),
    },
    {
      to: "/portal/admin/reports",
      label: "Reports",
      icon: BarChart3,
      show: can(role, "reports.export"),
    },
    {
      to: "/portal/admin/einstellungen",
      label: "System",
      icon: Settings,
      show: can(role, "settings.manage"),
    },
  ].filter((i) => i.show !== false);
}

/** Bottom-Tabs mobil – max. 5, klar */
const MOBILE_TABS = [
  { to: "/portal", label: "Heute", icon: Home, exact: true },
  { to: "/portal/auftraege", label: "Aufträge", icon: ClipboardList },
  { to: "/portal/kunden", label: "Kunden", icon: Users },
  { to: "/portal/gebiete", label: "Gebiete", icon: Map },
  { to: "/portal/provisionen", label: "Provision", icon: Wallet },
] as const;

export function PortalShell() {
  const { user, isPending } = useCurrentUserState();
  const { me, error } = usePortalMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [more, setMore] = useState(false);
  usePushWorker();

  if (isPending) {
    return (
      <div className="min-h-dvh bg-bg p-6">
        <div className="mx-auto max-w-md animate-pulse rounded-3xl bg-surface p-8">
          <div className="h-6 w-40 rounded bg-elevated" />
          <div className="mt-6 h-24 rounded-2xl bg-elevated" />
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn to="/login" />;

  if (error) {
    return (
      <div className="min-h-dvh grid place-items-center bg-bg px-4 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="min-h-dvh bg-bg p-6">
        <div className="mx-auto max-w-md h-48 animate-pulse rounded-3xl bg-surface p-8" />
      </div>
    );
  }

  if (me.profile.status === "blocked") {
    return (
      <div className="min-h-dvh grid place-items-center bg-bg px-4 text-center">
        <p>Ihr Zugang wurde gesperrt. Bitte wenden Sie sich an die Geschäftsführung.</p>
      </div>
    );
  }

  // Portal für ALLE Rollen – kein Redirect mehr nur Super-Admin
  const core = coreItems(me.profile.role, me.flags);
  const admin = adminItems(me.profile.role, me.flags);
  const isAdmin = admin.length > 0;

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return pathname === to || pathname === `${to}/`;
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-4 py-5">
          <Wordmark to="/portal" />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <p className="mb-1 px-3 text-[10px] uppercase tracking-[0.2em] text-muted">Arbeit</p>
          {core.map((i) => (
            <NavItem
              key={i.to + i.label}
              to={i.to}
              label={i.label}
              icon={i.icon}
              active={isActive(i.to, "exact" in i ? i.exact : false)}
              badge={
                i.to === "/portal/postfach"
                  ? me.mailUnread
                  : 0
              }
            />
          ))}

          {isAdmin ? (
            <>
              <p className="mt-6 mb-1 px-3 text-[10px] uppercase tracking-[0.2em] text-muted">
                Steuerung
              </p>
              {admin.map((i) => (
                <NavItem
                  key={i.to + i.label}
                  to={i.to}
                  label={i.label}
                  icon={i.icon}
                  active={isActive(i.to)}
                />
              ))}
            </>
          ) : null}
        </nav>

        <div className="border-t border-line p-3">
          <p className="truncate px-2 text-sm font-medium">
            {me.profile.first_name} {me.profile.last_name}
          </p>
          <p className="px-2 text-xs text-muted">
            {me.profile.role === "super_admin"
              ? "Leitung"
              : me.profile.role === "vertrieb"
                ? `Berater · Stufe ${me.profile.commission_stufe || 1}`
                : me.profile.role}
          </p>
          <p className="px-2 pt-1">
            <ServerLive />
          </p>
          <div className="mt-2 px-1">
            <UserButton />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-56">
        {/* Mobile Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden pt-[env(safe-area-inset-top)]">
          <Wordmark to="/portal" compact />
          <div className="flex items-center gap-1">
            <Link
              to="/portal/postfach"
              className="relative grid size-11 place-items-center"
              aria-label="Postfach"
            >
              <Mail className="size-5" />
              {me.mailUnread ? (
                <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-medium text-bg tabular-nums">
                  {me.mailUnread > 9 ? "9+" : me.mailUnread}
                </span>
              ) : null}
            </Link>
            <Link
              to="/portal/benachrichtigungen"
              className="grid size-11 place-items-center"
              aria-label="Hinweise"
            >
              <Bell className="size-5" />
            </Link>
            <button
              type="button"
              className="grid size-11 place-items-center"
              onClick={() => setMore(true)}
              aria-label="Mehr"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </header>

        <div className="px-4 pt-2 lg:hidden">
          <OfflineBar />
        </div>

        <div className="px-4 py-5 pb-28 lg:px-8 lg:pb-10">
          <AppUpdate />
          <Outlet />
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
        {MOBILE_TABS.map((t) => {
          const on = "exact" in t && t.exact
            ? pathname === "/portal" || pathname === "/portal/"
            : pathname === t.to || pathname.startsWith(`${t.to}/`);
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

      {/* More Sheet (mobil) */}
      {more ? (
        <div
          className="fixed inset-0 z-50 bg-bg/70 lg:hidden"
          onClick={() => setMore(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-surface p-5 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-gold">Mehr</p>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full bg-elevated"
                onClick={() => setMore(false)}
                aria-label="Schließen"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-1">
              {core
                .filter((i) => !MOBILE_TABS.some((t) => t.to === i.to))
                .map((i) => (
                  <Link
                    key={i.to + i.label}
                    to={i.to}
                    onClick={() => setMore(false)}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-elevated"
                  >
                    <i.icon className="size-4 text-gold" />
                    <span className="text-sm">{i.label}</span>
                  </Link>
                ))}
            </div>

            {isAdmin ? (
              <>
                <p className="mt-5 mb-2 px-3 text-[10px] uppercase tracking-[0.2em] text-muted">
                  Steuerung
                </p>
                <div className="space-y-1">
                  {admin.map((i) => (
                    <Link
                      key={i.to + i.label}
                      to={i.to}
                      onClick={() => setMore(false)}
                      className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-elevated"
                    >
                      <i.icon className="size-4 text-gold" />
                      <span className="text-sm">{i.label}</span>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}

            <Link
              to="/portal/profil"
              onClick={() => setMore(false)}
              className="mt-4 flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-elevated"
            >
              <UserRound className="size-4" />
              Profil & 2FA
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  badge = 0,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "mb-0.5 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-elevated hover:text-ink",
        active && "bg-elevated text-gold",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge > 0 ? (
        <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] font-medium text-bg tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
