import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/firmen/leistungen")({ component: Page });

function Page() {
  return (
    <PublicShell variant="firmen">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Leistungen</p>
        <h1 className="mt-2 font-display text-5xl">Was wir für Betriebe übernehmen.</h1>
        <div className="mt-10 space-y-8 text-muted">
          <section>
            <h2 className="font-display text-2xl text-ink">Gewerbestrom</h2>
            <p className="mt-2">
              Belieferung für SLP-Standorte: Praxis, Laden, Büro, Gastro.
              Aufnahme von Zähler, Verbrauch und Lieferbeginn. Der Netzbetreiber
              bleibt, der Lieferant wechselt.
            </p>
          </section>
          <section>
            <h2 className="font-display text-2xl text-ink">Gas</h2>
            <p className="mt-2">
              Parallel zum Strom, wenn der Standort Gas nutzt. Getrennte Verträge,
              ein Ansprechpartner.
            </p>
          </section>
          <section>
            <h2 className="font-display text-2xl text-ink">Mehrere Standorte</h2>
            <p className="mt-2">
              Filialen einzeln oder gebündelt aufnehmen. Jeder Standort mit eigener
              Zählernummer, eine Betreuung.
            </p>
          </section>
          <section>
            <h2 className="font-display text-2xl text-ink">Was wir nicht tun</h2>
            <p className="mt-2">
              Keine anonyme Ausschreibung über Portale. Keine Beratung gegen Honorar
              an der Tür. Konditionen kommen aus dem Vertrag, nicht aus einer Extra-Rechnung.
            </p>
          </section>
        </div>
        <Link to="/firmen/anfrage" className="mt-10 inline-block">
          <Button>Gespräch vereinbaren</Button>
        </Link>
      </div>
    </PublicShell>
  );
}
