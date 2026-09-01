import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Landmark, Scale, Shield } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/firmen")({ component: Page });

function Page() {
  return (
    <PublicShell variant="firmen">
      <section className="relative overflow-hidden">
        <img src="/brand-business.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45 ken-img" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/40" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
          <p className="reveal text-[11px] uppercase tracking-[0.36em] text-gold">Geschäftskunden</p>
          <h1 className="reveal reveal-d1 mt-4 max-w-3xl font-display text-4xl leading-[1.05] md:text-6xl">
            Energieversorgung auf Augenhöhe mit der Geschäftsführung.
          </h1>
          <p className="reveal reveal-d2 mt-6 max-w-xl text-lg text-muted">
            Strom und Gas für Praxis, Handel, Büro, Gastronomie und Filialen.
            Ein Vertragspartner, ein Ansprechpartner, keine anonyme Hotline.
          </p>
          <div className="reveal reveal-d3 mt-10 flex flex-wrap gap-3">
            <Link to="/firmen/anfrage">
              <Button size="lg">
                Gespräch vereinbaren <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/rechner">
              <Button size="lg" variant="outline">
                Kosten grob prüfen
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-16 md:grid-cols-3">
        {[
          { icon: Landmark, t: "Konditionen", d: "Arbeitspreis und Grundpreis nachvollziehbar. Keine versteckten Beratungsgebühren." },
          { icon: Shield, t: "Betreuung", d: "Orhan Salo und Luca-Marco Marrancone. Direkt, nicht über eine Zentrale." },
          { icon: Scale, t: "Umsetzung", d: "Wechsel ohne Versorgungsbruch. Schriftlich, nachvollziehbar, mit Widerruf." },
        ].map((x) => (
          <article key={x.t} className="rounded-3xl bg-surface p-6 gold-hairline">
            <x.icon className="size-6 text-gold" />
            <h2 className="mt-4 text-xl font-medium">{x.t}</h2>
            <p className="mt-2 text-sm text-muted">{x.d}</p>
          </article>
        ))}
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="text-xs uppercase tracking-[0.28em] text-gold">Für wen</p>
          <h2 className="mt-2 font-display text-4xl">Betriebe, die einen Namen wollen.</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {["Arztpraxis & Kanzlei", "Einzelhandel", "Gastronomie", "Büro & Dienstleistung", "Handwerk", "Filialen & Ketten"].map((s) => (
              <p key={s} className="rounded-2xl bg-bg px-4 py-4 gold-hairline">
                {s}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Ablauf</p>
        <h2 className="mt-2 font-display text-4xl">Vier Schritte. Kein Projektzirkus.</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ["1", "Kurzgespräch", "Verbrauch, Standort, bisheriger Vertrag."],
            ["2", "Gegenüberstellung", "Ist-Kosten gegen mögliche Konditionen."],
            ["3", "Entscheidung", "Sie prüfen. Wir drängen nicht."],
            ["4", "Wechsel", "Wir steuern die Abwicklung. Sie bleiben versorgt."],
          ].map(([n, t, d]) => (
            <li key={n} className="rounded-3xl bg-surface p-5 gold-hairline">
              <p className="text-gold">{n}</p>
              <p className="mt-2 font-medium">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8">
        <div className="overflow-hidden rounded-3xl bg-elevated gold-hairline md:grid md:grid-cols-2">
          <img src="/hero-founders.jpg" alt="Geschäftsführung E1 Direktvertrieb" className="h-64 w-full object-cover object-[50%_35%] md:h-full" />
          <div className="p-8">
            <Building2 className="size-6 text-gold" />
            <h2 className="mt-4 font-display text-3xl">Geschäftsführung persönlich.</h2>
            <p className="mt-3 text-muted">
              Orhan Salo und Luca-Marco Marrancone. Kein Key-Account-Karussell,
              kein Callcenter. Geschäftskunden sprechen mit uns.
            </p>
            <Link to="/firmen/anfrage">
              <Button className="mt-6">Gespräch mit der Geschäftsführung</Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
