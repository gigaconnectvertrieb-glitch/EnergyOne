import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { Wordmark } from "./logo";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { getPublicContact } from "@/lib/server/public";
import { formatPhone, telHref } from "@/lib/contact";

const NAV_PRIVAT = [
  { to: "/", label: "Start" },
  { to: "/privat", label: "Privat" },
  { to: "/firmen", label: "Unternehmen" },
  { to: "/rechner", label: "Rechner" },
  { to: "/karriere", label: "Karriere" },
];

const NAV_FIRMEN = [
  { to: "/firmen", label: "Geschäftskunden" },
  { to: "/firmen/leistungen", label: "Leistungen" },
  { to: "/rechner", label: "Kostenrechner" },
  { to: "/firmen/anfrage", label: "Gespräch" },
  { to: "/privat", label: "Privatkunden" },
];

export function PublicShell({ children, variant }: { children: ReactNode; variant?: "firmen" }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const firmen = variant === "firmen" || pathname.startsWith("/firmen");
  const NAV = firmen ? NAV_FIRMEN : NAV_PRIVAT;
  useEffect(() => {
    getPublicContact()
      .then((c) => setPhone(c.phone || ""))
      .catch(() => setPhone(""));
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-ink gold-wash">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to={firmen ? "/firmen" : "/"} aria-label="E1 Direktvertrieb">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-6 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn("text-sm text-muted hover:text-ink", pathname === n.to && "text-gold")}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <SignedOut>
              <Link to="/login" className="px-3 py-2 text-sm text-muted hover:text-ink">
                Login
              </Link>
            </SignedOut>
            <SignedIn>
              <Link to="/portal" className="px-3 py-2 text-sm text-muted hover:text-ink">
                Portal
              </Link>
            </SignedIn>
            <Link to={firmen ? "/firmen/anfrage" : "/beratung"}>
              <Button size="sm">{firmen ? "Gespräch vereinbaren" : "Beratung anfordern"}</Button>
            </Link>
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center lg:hidden"
            aria-label="Menü"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open ? (
          <div className="border-t border-line px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm hover:bg-elevated"
                >
                  {n.label}
                </Link>
              ))}
              <Link to="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm">
                Mitarbeiter-Login
              </Link>
              <Link to={firmen ? "/firmen/anfrage" : "/beratung"} onClick={() => setOpen(false)}>
                <Button className="mt-2 w-full">{firmen ? "Gespräch vereinbaren" : "Beratung anfordern"}</Button>
              </Link>
            </div>
          </div>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="mt-16 border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xs text-sm text-muted">
              {firmen
                ? "Geschäftskundenbetreuung für Strom und Gas. Direkter Draht zur Geschäftsführung."
                : "Energieberatung für Privathaushalte. Persönlich, vor Ort."}
            </p>
          </div>
          <div className="text-sm">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">Rechtliches</p>
            <div className="flex flex-col gap-2 text-muted">
              <Link to="/impressum">Impressum</Link>
              <Link to="/datenschutz">Datenschutz</Link>
              <Link to="/agb">AGB</Link>
              <Link to={firmen ? "/privat" : "/firmen"}>{firmen ? "Zum Privatbereich" : "Zum Firmenbereich"}</Link>
              <Link to="/login">Mitarbeiter-Portal</Link>
            </div>
          </div>
          <div className="text-sm text-muted">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">Kontakt</p>
            <p>{firmen ? "Geschäftskunden · info@e1direktvertrieb.de" : "Privatkunden · info@e1direktvertrieb.de"}</p>
            {phone ? (
              <p className="mt-2">
                Telefon{" "}
                <a className="text-gold" href={telHref(phone)}>
                  {formatPhone(phone) || phone}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
