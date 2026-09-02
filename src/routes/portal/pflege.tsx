import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { doneCare, listCare, mailCare, nudgeCare } from "@/lib/server/care-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/pflege")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCare>>>([]);
  function load() {
    listCare().then(setRows).catch(() => setRows([]));
    nudgeCare().catch(() => {});
  }
  useEffect(load, []);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Leitung</p>
      <h1 className="mt-1 font-display text-4xl">Kundenpflege</h1>
      <p className="mt-2 text-sm text-muted">
        Ein Jahr nach Abschluss. Ein paar Tage vorher Push. Anrufen oder Mail, dann Maske mit den alten Daten.
      </p>
      <div className="mt-6 grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="font-medium">{r.name}</p>
            <p className="text-sm text-muted">
              {r.street} {r.house}, {r.zip} {r.city} · fällig {r.due_on}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.phone ? (
                <a className="rounded-full px-3 py-2 text-xs gold-hairline" href={`tel:${r.phone}`}>
                  Anrufen
                </a>
              ) : null}
              {r.email ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await mailCare({ data: { id: r.id } });
                      toast.success("Mail raus.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Keine Mail");
                    }
                  }}
                >
                  Mail Reduzierung
                </Button>
              ) : null}
              <Link
                to="/portal/auftraege/neu"
                search={{
                  street: r.street,
                  house: r.house,
                  zip: r.zip,
                  city: r.city,
                }}
                className="rounded-full bg-gold px-3 py-2 text-xs text-bg"
              >
                Wieder aufnehmen
              </Link>
              <button
                type="button"
                className="text-xs text-muted"
                onClick={async () => {
                  await doneCare({ data: { id: r.id } });
                  load();
                }}
              >
                Erledigt
              </button>
            </div>
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-muted">Noch niemand am Jahrestag.</p> : null}
      </div>
    </div>
  );
}
