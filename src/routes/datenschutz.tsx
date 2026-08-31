import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/datenschutz")({ component: Page });

function Page() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-display text-5xl">Datenschutz</h1>
        <div className="mt-6 space-y-4 text-sm text-muted">
          <p>
            Wir verarbeiten nur Daten, die für Beratung, Vertrag und gesetzliche
            Pflichten nötig sind (Art. 6 Abs. 1 lit. b, a und c DSGVO).
          </p>
          <p>
            Beratungsanfragen und Bewerbungen speichern wir, um Sie zu kontaktieren.
            Verträge enthalten Stammdaten, Zähler, Bankverbindung und Einwilligungen.
          </p>
          <p>
            Sie haben Auskunft, Berichtigung, Löschung und Widerspruch. Löschanfragen
            bearbeitet das Backoffice bzw. ein Super-Admin.
          </p>
          <p>Hosting in der EU. Keine Weitergabe zu Werbezwecken Dritter.</p>
          <p>
            Auskunft und Löschung:{" "}
            <a className="text-gold" href="mailto:info@e1direktvertrieb.de">
              info@e1direktvertrieb.de
            </a>
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
