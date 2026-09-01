import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privat")({ component: Page });

function Page() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Privathaushalt</p>
        <h1 className="mt-2 font-display text-5xl">Strom und Gas für Zuhause.</h1>
        <p className="mt-4 text-lg text-muted">
          Wohnung oder Haus. Wir erklären Tarif, Verbrauch und Wechsel persönlich —
          ohne Hotline, ohne Druck.
        </p>
        <ul className="mt-8 grid gap-3 text-sm text-muted">
          <li>Wechsel ohne Versorgungslücke</li>
          <li>14 Tage Widerruf</li>
          <li>Strom und Gas getrennt oder zusammen</li>
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/rechner">
            <Button>Ersparnis rechnen</Button>
          </Link>
          <Link to="/beratung">
            <Button variant="outline">Beratung anfordern</Button>
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
