import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/firmen/leistungen")({ component: Page });

const LEISTUNGEN = [
  {
    t: "Gewerbestrom",
    w: "Praxis, Kanzlei, Büro, Laden, Gastro, Werkstatt",
    i: "Zählerstand, Jahresverbrauch, Lieferbeginn, bisheriger Vertrag.",
    d: "Wir nehmen den Standort auf und steuern den Wechsel. Der Netzbetreiber bleibt. Sie bleiben versorgt.",
  },
  {
    t: "Gas",
    w: "Heizung, Küche, Produktion, wenn der Standort Gas hat",
    i: "Verbrauch, Zählernummer, Wunschtermin.",
    d: "Eigener Vertrag, derselbe Ansprechpartner wie beim Strom. Kein zweites Callcenter.",
  },
  {
    t: "Mehrere Standorte",
    w: "Filialen, Praxen, zweite Adresse",
    i: "Liste der Adressen und Zähler.",
    d: "Jeder Standort einzeln sauber, eine Betreuung. Kein Sammelchaos.",
  },
  {
    t: "Rechnung prüfen",
    w: "Wenn Sie nur wissen wollen, ob der aktuelle Tarif passt",
    i: "Letzte Jahresrechnung oder Abschlag + Arbeitspreis.",
    d: "Wir rechnen Ist gegen machbar. Kein Honorar für das Gespräch.",
  },
];

function Page() {
  return (
    <PublicShell variant="firmen">
      <section className="relative overflow-hidden">
        <img src="/brand-mark.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 ken-img" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/85 to-bg" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-24">
          <p className="reveal text-[11px] uppercase tracking-[0.36em] text-gold">Leistungen</p>
          <h1 className="reveal reveal-d1 mt-4 max-w-3xl font-display text-5xl md:text-6xl">
            Was wir konkret machen.
          </h1>
          <p className="reveal reveal-d2 mt-4 max-w-xl text-muted">
            Kein Portal-Vergleich. Aufnahme, Prüfung, Wechsel. Mit Namen.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-5 md:grid-cols-2">
          {LEISTUNGEN.map((l) => (
            <article key={l.t} className="rounded-[1.5rem] bg-surface p-7 gold-hairline">
              <h2 className="font-display text-3xl">{l.t}</h2>
              <p className="mt-3 text-sm text-muted">{l.d}</p>
              <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-gold">Für wen</p>
              <p className="mt-1 text-sm">{l.w}</p>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-gold">Was wir brauchen</p>
              <p className="mt-1 text-sm text-muted">{l.i}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl">Was nicht dazugehört</h2>
          <ul className="mt-6 grid gap-3 text-muted md:grid-cols-3">
            <li>Keine Ausschreibung über Vergleichsportale</li>
            <li>Keine Beratungsgebühr an der Tür</li>
            <li>Kein Callcenter nach dem Abschluss</li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-muted">Nächster Schritt: kurzes Gespräch mit der Geschäftsführung.</p>
        <Link to="/firmen/anfrage" className="mt-6 inline-block">
          <Button size="lg">Gespräch vereinbaren</Button>
        </Link>
      </section>
    </PublicShell>
  );
}
