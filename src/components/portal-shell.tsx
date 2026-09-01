import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Briefcase,
  Flag,
  LayoutDashboard,
  Plus,
  ScrollText,
  Settings,
  Shield,
  Users,
  Wallet,
  Mail,
  Map,
  PenLine,
  BarChart3,
  Calculator,
  ClipboardList,
  UserRound,
  Menu,
} from "lucide-react";
import { useEffect, useState } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootstrapMe } from "@/lib/server/api";
import type { Profile } from "@/lib/e1";
import { can, type Role } from "@/lib/e1";
import { Wordmark } from "./logo";
import { usePushWorker } from "./goal-card";
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

function items(role: Role, flags: Record<string, boolean>) {
  const base = [
    { to: "/portal", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/portal/auftraege", label: "Aufträge", icon: ClipboardList, show: true },
    { to: "/portal/gebiete", label: "Gebiete", icon: Map, show: flags.field_routing !== false && can(role, "team.view") },
    { to: "/portal/kunden", label: "Kunden", icon: Users, show: true },
    { to: "/portal/postfach", label: "Postfach", icon: Mail, show: true },
    { to: "/portal/provisionen", label: "Provisionen", icon: Wallet, show: true },
    { to: "/portal/steuern", label: "Steuer", icon: Calculator, show: true },
    { to: "/portal/wissen", label: "Wissen", icon: BookOpen, show: flags.knowledge_area !== false },
    { to: "/portal/team", label: "Team", icon: UserRound, show: can(role, "team.view") || role === "vertrieb" },
    { to: "/portal/benachrichtigungen", label: "Hinweise", icon: Bell, show: true },
  ];
  const admin = [
    { to: "/portal/admin/benutzer", label: "Benutzer", icon: Shield, show: can(role, "users.manage") || can(role, "team.view") },
    { to: "/portal/admin/regionen", label: "Regionen", icon: Map, show: can(role, "settings.manage") || can(role, "team.view") },
    { to: "/portal/admin/produkte", label: "Tarife", icon: Briefcase, show: can(role, "products.manage") || can(role, "contracts.view_all") },
    { to: "/portal/admin/leads", label: "Leads", icon: ScrollText, show: can(role, "contracts.view_all") || role === "teamleiter" },
    { to: "/portal/admin/onboarding", label: "Onboarding", icon: Users, show: flags.recruiting_pipeline && can(role, "users.manage") },
    { to: "/portal/admin/partner", label: "Partner", icon: Briefcase, show: flags.partner_module && can(role, "users.manage") },
    { to: "/portal/admin/qualitaet", label: "Qualität", icon: Flag, show: flags.quality_alerts && can(role, "team.view") },
    { to: "/portal/admin/reports", label: "Reports", icon: BarChart3, show: can(role, "reports.export") },
    { to: "/portal/admin/audit", label: "Audit", icon: Shield, show: can(role, "audit.view") },
    { to: "/portal/admin/mail", label: "Workspace", icon: Mail, show: can(role, "settings.manage") },
    { to: "/portal/admin/signatur", label: "Signatur", icon: PenLine, show: can(role, "settings.manage") },
    { to: "/portal/admin/vertraege", label: "HV-Verträge", icon: ScrollText, show: can(role, "settings.manage") },
    { to: "/portal/admin/einstellungen", label: "System", icon: Settings, show: can(role, "settings.manage") },
  ];
  return { base: base.filter((i) => i.show), admin: admin.filter((i) => i.show) };
}

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
        <div className="mx-auto max-w-md animate-pulse rounded-3xl bg-surface p-8 h-48" />
      </div>
    );
  }

  if (me.profile.status === "pending") {
    return (
      <div className="min-h-dvh gold-wash grid place-items-center px-4">
        <div className="max-w-md rounded-3xl bg-surface p-8 text-center gold-hairline">
          <Wordmark className="justify-center" />
          <h1 className="mt-6 font-display text-3xl">Zugang in Prüfung</h1>
          <p className="mt-3 text-sm text-muted">
            Ihr Konto ist angelegt. Ein Super-Admin schaltet Sie frei. Danach
            können Sie Aufträge erfassen.
          </p>
          <div className="mt-6 flex justify-center">
            <UserButton />
          </div>
        </div>
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

  const { base, admin } = items(me.profile.role, me.flags);
  const all = [...base, ...admin];

  const shell = (
    <div className="min-h-dvh bg-bg text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-4 py-4">
          <Wordmark to="/portal" />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {base.map((i) => (
            <NavItem
              key={i.to}
              {...i}
              active={pathname === i.to || (i.to === "/portal/postfach" && pathname.startsWith("/portal/postfach"))}
              badge={i.to === "/portal/postfach" ? me.mailUnread : i.to === "/portal/benachrichtigungen" ? me.unread : 0}
            />
          ))}
          {admin.length ? (
            <p className="mt-4 mb-1 px-3 text-[10px] uppercase tracking-[0.2em] text-muted">
              Steuerung
            </p>
          ) : null}
          {admin.map((i) => (
            <NavItem key={i.to} {...i} active={pathname === i.to} />
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <p className="truncate px-2 text-sm">
            {me.profile.first_name} {me.profile.last_name}
          </p>
          <p className="px-2 text-xs text-muted">{me.profile.role}</p>
          <div className="mt-2 px-1">
            <UserButton />
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
          <Wordmark to="/portal" compact />
          <div className="flex items-center gap-2">
            <Link to="/portal/postfach" className="relative grid size-11 place-items-center" aria-label="Postfach">
              <Mail className="size-5" />
              {me.mailUnread ? (
                <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-medium text-bg tabular-nums">
                  {me.mailUnread > 9 ? "9+" : me.mailUnread}
                </span>
              ) : null}
            </Link>
            <Link to="/portal/benachrichtigungen" className="grid size-11 place-items-center">
              <Bell className="size-5" />
            </Link>
            <button type="button" className="grid size-11 place-items-center" onClick={() => setMore(true)} aria-label="Mehr">
              <Menu className="size-5" />
            </button>
          </div>
        </header>
        <div className="px-4 py-6 pb-28 lg:px-8 lg:pb-10">
          <Outlet />
        </div>
      </div>

      <Link
        to="/portal/auftraege/neu"
        className="fixed bottom-20 right-4 z-40 grid size-14 place-items-center rounded-full bg-gold text-bg shadow-lg lg:bottom-8 lg:right-8"
        aria-label="Kurz erfassen"
      >
        <Plus className="size-7" />
      </Link>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
        {[
          { to: "/portal", label: "Home", icon: LayoutDashboard },
          { to: "/portal/auftraege", label: "Aufträge", icon: ClipboardList },
          { to: "/portal/auftraege/neu", label: "Neu", icon: Plus },
          can(me.profile.role, "team.view")
            ? { to: "/portal/gebiete", label: "Gebiete", icon: Map }
            : { to: "/app", label: "Feld", icon: Map },
          { to: "/portal/provisionen", label: "Provision", icon: Wallet },
        ].map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted",
              pathname === i.to && "text-gold",
            )}
          >
            <i.icon className="size-5" />
            {i.label}
          </Link>
        ))}
      </nav>

      {more ? (
        <div className="fixed inset-0 z-50 bg-bg/70 lg:hidden" onClick={() => setMore(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold">Mehr</p>
            {all.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                onClick={() => setMore(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 hover:bg-elevated"
              >
                <i.icon className="size-4 text-gold" />
                {i.label}
              </Link>
            ))}
            <Link to="/portal/profil" onClick={() => setMore(false)} className="mt-2 flex min-h-11 items-center px-2">
              Profil & 2FA
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );

  return shell;
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
        "mb-0.5 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-elevated hover:text-ink",
        active && "bg-elevated text-gold",
      )}
    >
      <Icon className="size-4" />
      {label}
      {badge ? (
        <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] font-medium text-bg tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
