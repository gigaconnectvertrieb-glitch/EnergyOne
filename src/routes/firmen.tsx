import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/firmen")({ component: Page });

function Page() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Unternehmen</p>
        <h1 className="mt-2 font-display text-5xl">Energie für den Betrieb.</h1>
        <p className="mt-4 text-lg text-muted">
          Praxis, Laden, Büro, Gastro, Filiale. Ein fester Ansprechpartner.
          Anfragen an info@e1direktvertrieb.de.
        </p>
        <ul className="mt-8 grid gap-3 text-sm text-muted">
          <li>Gewerbestrom und Gas</li>
          <li>Kein Callcenter, direkte Geschäftsführung</li>
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/rechner">
            <Button>Ersparnis rechnen</Button>
          </Link>
          <Link to="/beratung">
            <Button variant="outline">Geschäftskunden-Anfrage</Button>
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted">
          <a className="text-gold" href="mailto:info@e1direktvertrieb.de">
            info@e1direktvertrieb.de
          </a>
        </p>
      </div>
    </PublicShell>
  );
}
