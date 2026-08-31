import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { PublicShell } from "@/components/public-shell";
import { Wordmark, BrandLockup } from "@/components/logo";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Mail,
  Plus,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/vorschau")({ component: Page });

const TABS = [
  { id: "website", label: "Website" },
  { id: "login", label: "Login" },
  { id: "admin", label: "Super-Admin" },
  { id: "mitarbeiter", label: "Mitarbeiter" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function Page() {
  const [tab, setTab] = useState<Tab>("admin");
  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Produktvorschau</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">So sieht E1 aus.</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted md:text-base">
          Website, Login, Super-Admin und Mitarbeiter. Ohne Anmeldung durchklicken.
          Der echte Vertrag bleibt in New Sales — das Portal ist die kurze Liste.
        </p>
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 text-sm",
                tab === t.id ? "bg-gold text-bg" : "gold-hairline text-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-8">
          {tab === "website" ? <WebsitePrev /> : null}
          {tab === "login" ? <LoginPrev /> : null}
          {tab === "admin" ? <AdminPrev /> : null}
          {tab === "mitarbeiter" ? <StaffPrev /> : null}
        </div>
      </div>
    </PublicShell>
  );
}

function WebsitePrev() {
  const pages = [
    { to: "/", title: "Start", text: "Hero, Beratung, Gründer Orhan Salo und Luca Marco Marrancone." },
    { to: "/ueber-uns", title: "Über uns", text: "Team, Haltung, Dark-Gold-Branding." },
    { to: "/energie", title: "Energie", text: "Strom und Gas. Phase 1 über New Sales." },
    { to: "/karriere", title: "Karriere", text: "Bewerbung, Onboarding, Stufen." },
    { to: "/beratung", title: "Beratung", text: "Lead-Formular für Endkunden." },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Frame title="Öffentliche Website">
        <div className="flex items-center justify-between rounded-2xl bg-elevated px-3 py-2">
          <Wordmark to="/" />
          <span className="hidden text-xs text-muted sm:inline">Start · Über uns · Energie</span>
        </div>
        <img src="/hero-germany.jpg" alt="" className="mt-3 h-36 w-full rounded-2xl object-cover opacity-80" />
        <img src="/logo-full.jpg" alt="" className="mx-auto mt-4 h-36 w-auto object-contain" />
        <p className="mt-4 font-display text-2xl">Ein Gesicht für Ihre Energieberatung.</p>
        <p className="mt-2 text-sm text-muted">Kein Callcenter. Persönlich vor Ort.</p>
        <div className="mt-4 flex gap-2">
          <span className="rounded-lg bg-gold px-3 py-2 text-xs text-bg">Beratung anfordern</span>
          <span className="rounded-lg px-3 py-2 text-xs gold-hairline">Die Köpfe hinter E1</span>
        </div>
        <p className="mt-5 text-xs text-muted">
          Kontakt: <span className="text-gold">info@e1direktvertrieb.de</span>
        </p>
      </Frame>
      <div className="grid gap-3">
        {pages.map((p) => (
          <Link key={p.to} to={p.to} className="rounded-2xl bg-surface p-4 gold-hairline hover:bg-elevated">
            <p className="font-medium">{p.title}</p>
            <p className="mt-1 text-sm text-muted">{p.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LoginPrev() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Frame title="Mitarbeiter-Login">
        <BrandLockup className="mx-auto h-36 w-auto" />
        <h2 className="mt-6 text-center font-display text-3xl">Mitarbeiter-Portal</h2>
        <p className="mt-2 text-center text-sm text-muted">
          Erster Zugang wird Super-Admin. Danach Mitarbeiter mit Freischaltung.
        </p>
        <div className="mt-6 grid gap-3">
          <div className="h-11 rounded-xl bg-elevated px-3 text-sm leading-[2.75rem] text-muted">E-Mail</div>
          <div className="h-11 rounded-xl bg-elevated px-3 text-sm leading-[2.75rem] text-muted">Passwort</div>
          <div className="h-11 rounded-xl bg-gold text-center text-sm font-medium leading-[2.75rem] text-bg">
            Anmelden
          </div>
        </div>
        <Link to="/login" className="mt-6 block">
          <Button className="w-full">Echten Login öffnen</Button>
        </Link>
      </Frame>
      <div className="rounded-3xl bg-surface p-6 gold-hairline">
        <h2 className="font-display text-2xl">Zwei Rollen zum Anschauen</h2>
        <ol className="mt-4 space-y-4 text-sm">
          <li>
            <span className="text-gold">1 · Super-Admin</span>
            <p className="mt-1 text-muted">
              Orhan oder Luca. Sieht alle Aufträge, Benutzer, Tarife, Reports, Workspace.
            </p>
          </li>
          <li>
            <span className="text-gold">2 · Mitarbeiter</span>
            <p className="mt-1 text-muted">
              Tippt nur Name, Adresse, Telefon, Tarif. Sieht eigene Provision. Nicht das ganze Unternehmen.
            </p>
          </li>
        </ol>
        <p className="mt-6 text-sm text-muted">
          Teamleiter prüfen die Verträge in New Sales. Das Portal füllt die E1-Datenbank.
        </p>
      </div>
    </div>
  );
}

function AdminPrev() {
  return (
    <PortalMock
      who="Orhan Salo · Super-Admin"
      nav={["Dashboard", "Aufträge", "Kunden", "Postfach", "Provisionen", "Benutzer", "Tarife", "Reports", "Workspace", "System"]}
      active="Dashboard"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Willkommen zurück</p>
      <h2 className="mt-1 font-display text-3xl">Orhan, hier ist der Stand.</h2>
      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Abschlüsse Monat" value="12" hint="Ziel 40" />
        <Kpi label="Neue Einträge" value="18" hint="diesen Monat" />
        <Kpi label="Provision offen" value="4.280 €" hint="Freigegeben 1.150 €" />
        <Kpi label="Stornos" value="2" hint="10 Aufträge" />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl bg-elevated p-4">
          <p className="text-xs text-muted">Alle Aufträge</p>
          <Row name="Hans Müller" meta="Ökostrom 12 · Jonas" status="uebermittelt" />
          <Row name="Anna Schmidt" meta="Gas 24 · Sara" status="bestaetigt" />
          <Row name="Thomas Weber" meta="Ökostrom 12 · Nina" status="beliefert" />
        </div>
        <div className="rounded-2xl bg-elevated p-4">
          <p className="text-xs text-muted">Team</p>
          <p className="mt-2 flex justify-between text-sm">
            Jonas Keller <span className="text-gold">3 Abschlüsse</span>
          </p>
          <p className="mt-2 flex justify-between text-sm">
            Sara Berg <span className="text-gold">2 Abschlüsse</span>
          </p>
          <p className="mt-2 flex justify-between text-sm">
            Nina Schwarz <span className="text-gold">1 Abschluss</span>
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <AdminCard icon={Users} title="Benutzer" text="Rollen, Freischaltung, Stufen 1–3." />
        <AdminCard icon={BarChart3} title="Reports" text="CSV, DATEV, Pipeline." />
        <AdminCard icon={Mail} title="Workspace" text="Gmail über Google. Render hostet nur die App." />
      </div>
    </PortalMock>
  );
}

function StaffPrev() {
  return (
    <PortalMock
      who="Jonas Keller · Vertrieb · Stufe 1"
      nav={["Dashboard", "Aufträge", "Eintrag", "Kunden", "Provision"]}
      active="Eintrag"
      staff
    >
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Schnell erfassen</p>
      <h2 className="mt-1 font-display text-3xl">Name, Adresse, Tarif</h2>
      <p className="mt-2 text-sm text-muted">
        Vertrag steht in New Sales. Hier nur die kurze Liste. Teamleiter gleicht dort ab.
      </p>
      <div className="mt-5 grid gap-3 rounded-2xl bg-elevated p-4 sm:grid-cols-2">
        <FakeField label="Vorname" value="Hans" />
        <FakeField label="Nachname" value="Müller" />
        <FakeField label="Telefon" value="030 998877" className="sm:col-span-2" />
        <FakeField label="Straße" value="Kastanienallee" />
        <FakeField label="Nr." value="12" />
        <FakeField label="PLZ" value="10435" />
        <FakeField label="Ort" value="Berlin" />
      </div>
      <div className="mt-3 grid gap-3 rounded-2xl bg-elevated p-4">
        <FakeField label="Tarif" value="Green Planet · Ökostrom 12" />
        <FakeField label="Jahresverbrauch kWh" value="3200" />
        <p className="font-display text-3xl text-gold">180,00 €</p>
        <p className="text-xs text-muted">Provision Stufe 1 — landet in der Datenbank, nicht in New Sales.</p>
        <div className="h-11 rounded-xl bg-gold text-center text-sm font-medium leading-[2.75rem] text-bg">
          In die Datenbank
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-elevated p-4">
        <p className="text-xs text-muted">Nur eigene Aufträge</p>
        <Row name="Hans Müller" meta="Berlin · 3200 kWh" status="uebermittelt" />
        <Row name="Claudia König" meta="Köln · storniert" status="storniert" />
      </div>
    </PortalMock>
  );
}

function PortalMock({
  who,
  nav,
  active,
  staff,
  children,
}: {
  who: string;
  nav: string[];
  active: string;
  staff?: boolean;
  children: ReactNode;
}) {
  const icons = [LayoutDashboard, ClipboardList, Plus, Users, Wallet, Shield, BarChart3, Mail, Settings];
  return (
    <div className="overflow-hidden rounded-3xl bg-surface gold-hairline">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <Wordmark to="/vorschau" />
        <p className="truncate text-xs text-muted">{who}</p>
      </div>
      <div className="lg:grid lg:grid-cols-[13rem_1fr]">
        <aside className="hidden border-r border-line p-3 lg:block">
          {nav.map((n, i) => {
            const Icon = icons[i] ?? ClipboardList;
            return (
              <div
                key={n}
                className={cn(
                  "mb-0.5 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm",
                  n === active ? "bg-elevated text-gold" : "text-muted",
                )}
              >
                <Icon className="size-4" />
                {n}
              </div>
            );
          })}
        </aside>
        <div className="p-4 md:p-6">{children}</div>
      </div>
      {staff ? (
        <div className="flex border-t border-line lg:hidden">
          {["Home", "Aufträge", "Neu", "Provision"].map((n) => (
            <span key={n} className="flex-1 py-3 text-center text-xs text-muted">
              {n}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-surface p-5 gold-hairline">
      <p className="mb-4 text-xs uppercase tracking-[0.2em] text-gold">{title}</p>
      {children}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-elevated p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function Row({ name, meta, status }: { name: string; meta: string; status: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <div>
        <p className="text-sm">{name}</p>
        <p className="text-xs text-muted">{meta}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function AdminCard({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-elevated p-4">
      <Icon className="size-4 text-gold" />
      <p className="mt-2 font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted">{text}</p>
    </div>
  );
}

function FakeField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="h-11 rounded-xl bg-surface px-3 text-sm leading-[2.75rem]">{value}</div>
    </div>
  );
}
