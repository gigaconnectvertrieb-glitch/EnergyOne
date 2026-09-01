import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privat")({ component: Page });

function Page() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden">
        <img src="/brand-home.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45 ken-img" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/20 via-bg/80 to-bg" />
        <div className="relative mx-auto max-w-3xl px-4 py-24 md:py-32">
        <p className="reveal text-[11px] uppercase tracking-[0.36em] text-gold">Privathaushalt</p>
        <h1 className="reveal reveal-d1 mt-4 font-display text-5xl md:text-6xl">Strom und Gas für Zuhause.</h1>
        <p className="reveal reveal-d2 mt-4 text-lg text-muted">
          Wohnung oder Haus. Wir erklären Tarif, Verbrauch und Wechsel persönlich, ohne Hotline, ohne Druck.
        </p>
        <ul className="reveal reveal-d3 mt-8 grid gap-3 text-sm text-muted">
          <li>Wechsel ohne Versorgungslücke</li>
          <li>14 Tage Widerruf</li>
          <li>Strom und Gas getrennt oder zusammen</li>
        </ul>
        <div className="reveal reveal-d3 mt-10 flex flex-wrap gap-3">
          <Link to="/rechner">
            <Button>Ersparnis rechnen</Button>
          </Link>
          <Link to="/beratung">
            <Button variant="outline">Beratung anfordern</Button>
          </Link>
        </div>
        </div>
      </section>
    </PublicShell>
  );
}
