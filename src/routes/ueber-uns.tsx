import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ueber-uns")({ component: Page });

function Page() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-4xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Über E1</p>
        <h1 className="mt-2 font-display text-5xl">Wir sind kein Konzern ohne Gesicht.</h1>
        <p className="mt-4 text-lg text-muted">
          E1 Direktvertrieb ist persönlicher Energievertrieb für Strom und Gas.
          Gegründet von Orhan Salo und Luca-Marco Marrancone – aus dem Vertrieb
          heraus, für Menschen, die ehrliche Beratung wollen.
        </p>
        <img
          src="/hero-founders.jpg"
          alt="E1-Team mit Orhan Salo und Luca-Marco Marrancone"
          className="mt-10 h-64 w-full rounded-3xl object-cover object-[50%_35%] gold-hairline md:h-96"
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl bg-surface p-6 gold-hairline">
            <h2 className="text-xl">Orhan Salo</h2>
            <p className="text-sm text-gold">Geschäftsführer & Gründer</p>
            <p className="mt-3 text-sm text-muted">
              Head of Sales. Steht selbst beim Kunden, baut Teams und besteht
              darauf, dass Abschlüsse halten – nicht nur auf dem Papier.
            </p>
          </article>
          <article className="rounded-3xl bg-surface p-6 gold-hairline">
            <h2 className="text-xl">Luca-Marco Marrancone</h2>
            <p className="text-sm text-gold">Geschäftsführer & Gründer</p>
            <p className="mt-3 text-sm text-muted">
              Head of Sales & Team. Entwickelt Strukturen, die skalieren, ohne
              den direkten Draht zwischen Berater und Kunde zu verlieren.
            </p>
          </article>
        </div>
        <Link to="/beratung">
          <Button className="mt-10">Gespräch vereinbaren</Button>
        </Link>
      </div>
    </PublicShell>
  );
}
