import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fieldBalance } from "@/lib/server/field-api";
import { eur } from "@/lib/utils";

export const Route = createFileRoute("/app/bilanz")({ component: Page });

function Card({ label, n, value }: { label: string; n: number; value: number }) {
  return (
    <div className="rounded-3xl bg-surface p-5 gold-hairline">
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">{label}</p>
      <p className="mt-3 font-display text-4xl tabular-nums">{eur(value)}</p>
      <p className="mt-1 text-sm text-muted">{n} Abschlüsse</p>
    </div>
  );
}

function Page() {
  const [b, setB] = useState<Awaited<ReturnType<typeof fieldBalance>> | null>(null);
  useEffect(() => {
    fieldBalance()
      .then(setB)
      .catch(() => setB(null));
  }, []);
  if (!b) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Eigene Zahlen</p>
      <h1 className="mt-1 font-display text-4xl">{b.name}</h1>
      <div className="mt-6 grid gap-3">
        <Card label="Heute" n={b.tag.n} value={b.tag.eur} />
        <Card label="Diese Woche" n={b.woche.n} value={b.woche.eur} />
        <Card label="Dieser Monat" n={b.monat.n} value={b.monat.eur} />
      </div>
      <Link to="/app/mehr" className="mt-6 block text-sm text-gold">
        Gebiet und Einstellungen
      </Link>
    </div>
  );
}
