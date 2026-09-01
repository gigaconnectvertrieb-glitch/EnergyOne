import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadMyTerritory } from "@/lib/server/field-api";
import { signOut } from "@/lib/auth/client";
import { toast } from "sonner";

export const Route = createFileRoute("/app/mehr")({ component: Page });

function Page() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setStandalone(Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches);
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
        <Link to="/portal" className="rounded-xl px-4 py-3 text-center text-sm gold-hairline">
          Zum Portal
        </Link>
        <Button variant="outline" onClick={() => void signOut()}>
          Abmelden
        </Button>
      </div>
    </div>
  );
}
