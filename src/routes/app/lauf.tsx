import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listRunSheet } from "@/lib/server/field-api";

export const Route = createFileRoute("/app/lauf")({ component: Page });

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof listRunSheet>> | null>(null);
  useEffect(() => {
    listRunSheet().then(setData).catch(() => setData({ name: "", rows: [] }));
  }, []);
  const rows = data?.rows || [];
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Laufliste</p>
      <h1 className="mt-1 font-display text-3xl">{data?.name || "Gebiet"}</h1>
      <p className="mt-2 text-sm text-muted">Jedes Haus im aufgespielten Gebiet. Letzter Besuch bleibt stehen.</p>
      <ul className="mt-4 divide-y divide-white/6 overflow-hidden rounded-2xl bg-surface">
        {rows.map((r) => (
          <li key={`${r.street}-${r.house}`}>
            <Link
              to="/app/abschluss"
              search={{ street: r.street, house: r.house, zip: r.zip, city: r.city }}
              className="flex items-center justify-between gap-2 px-4 py-3"
            >
              <span>
                <span className="block text-[15px]">
                  {r.street} {r.house}
                </span>
                <span className="text-xs text-muted">
                  {r.units ? `${r.units} WE · ` : ""}
                  {r.last || "noch nicht"}
                  {r.last_at ? ` · ${r.last_at}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {!rows.length ? <li className="px-4 py-6 text-sm text-muted">Kein Gebiet aufgespielt.</li> : null}
      </ul>
    </div>
  );
}
