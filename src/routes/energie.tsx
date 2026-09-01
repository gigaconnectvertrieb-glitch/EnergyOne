import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/energie")({ component: Page });

function Page() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Energie-Lösungen</p>
        <h1 className="mt-2 font-display text-5xl">Strom und Gas für Haushalt und Betrieb.</h1>
        <div className="mt-8 space-y-6 text-muted">
          <p>
            Der Markt ist liberalisiert. Privathaushalt und Gewerbe dürfen den
            Lieferanten frei wählen. Der Netzbetreiber bleibt, die Belieferung wechselt.
          </p>
          <p>
            <strong className="text-ink">Privat:</strong> Wohnung oder Haus, Strom und
            Gas, Wechsel ohne Versorgungslücke, Widerruf in 14 Tagen.
          </p>
          <p>
            <strong className="text-ink">Gewerbe:</strong> Praxis, Laden, Büro, Filiale,
            Gastronomie. Ein Ansprechpartner statt Hotline – Anfragen an
            business@e1direktvertrieb.de.
          </p>
          <p>
            <strong className="text-ink">Grundversorgung</strong> ist das Auffangnetz,
            wenn kein Vertrag greift – meist teurer als ein klar kalkulierter Tarif.
          </p>
          <p>
            <strong className="text-ink">Wechsel ohne Lücke:</strong> Der neue Lieferant
            kündigt den alten. Zwischen den Terminen bleiben Sie versorgt.
          </p>
          <p>
            Phase 1: E1 vermittelt über den Partner New Sales. Phase 2: eigene E1-Tarife.
            Die Beratung bleibt dieselbe – persönlich, vor Ort, ohne Druck.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
