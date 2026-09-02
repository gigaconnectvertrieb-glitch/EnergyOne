import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GoalCard } from "@/components/goal-card";
import { claimTerritory, downloadMyTerritory, listTerritories } from "@/lib/server/field-api";
import { signOut } from "@/lib/auth/client";
import { toast } from "sonner";

export const Route = createFileRoute("/app/mehr")({ component: Page });

function Page() {
  const [standalone, setStandalone] = useState(false);
  const [ters, setTers] = useState<Awaited<ReturnType<typeof listTerritories>>>([]);
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setStandalone(Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches);
    listTerritories().then(setTers).catch(() => setTers([]));
  }, []);
  return (
    <div>
      <h1 className="font-display text-3xl">E1 Feld</h1>
      <p className="mt-2 text-sm text-muted">
        {standalone
          ? "App ist auf dem Home-Bildschirm."
          : "iPhone: Teilen → Zum Home-Bildschirm. Android: Menü → App installieren."}
      </p>
      {!standalone ? (
        <div className="mt-4 rounded-2xl bg-surface p-4 text-sm gold-hairline">
          <p className="font-medium">So liegt die App auf dem Handy</p>
          <p className="mt-2 text-muted">
            Safari oder Chrome öffnen, diese Seite lassen, dann zum Home-Bildschirm legen. Danach startet sie wie eine normale App — ohne Browser-Leiste.
          </p>
        </div>
      ) : null}
      <div className="mt-6">
        <GoalCard />
      </div>
      {ters.length ? (
        <div className="mt-6 rounded-3xl bg-surface p-4 gold-hairline">
          <p className="text-sm font-medium">Gebiet selbst aufspielen</p>
          <p className="mt-1 text-xs text-muted">In erster Linie spielt Orhan zu. Hier nur wenn nötig.</p>
          <ul className="mt-3 grid gap-2">
            {ters.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{t.name}</span>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await claimTerritory({ data: { id: t.id } });
                      toast.success("Gebiet auf diesem Gerät");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Nicht zugewiesen");
                    }
                  }}
                >
                  Aufspielen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link to="/app/suche" className="mt-4 block text-sm text-gold">
        Laufweg / Straßen
      </Link>
      <div className="mt-6 grid gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const file = await downloadMyTerritory();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([file.json], { type: "application/geo+json" }));
              a.download = file.filename;
              a.click();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Kein Gebiet");
            }
          }}
        >
          Gebiet herunterladen
        </Button>
        <Link to="/portal/steuern" className="rounded-xl px-4 py-3 text-center text-sm gold-hairline">
          Steuer / Ausgaben
        </Link>
        <a href="/portal" className="rounded-xl px-4 py-3 text-center text-sm gold-hairline">
          Zum Portal
        </a>
        <Button variant="outline" onClick={() => void signOut()}>
          Abmelden
        </Button>
      </div>
    </div>
  );
}
