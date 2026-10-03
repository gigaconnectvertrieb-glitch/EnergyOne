/**
 * E1 Kunden – Liste
 * -----------------
 * Suche, Übersicht, Link zu Aufträgen.
 *
 * Ersetzt: src/routes/portal/kunden/index.tsx
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listCustomers } from "@/lib/server/api";
import { deDate } from "@/lib/utils";
import { Input } from "@/components/ui/field";
import { Search, User } from "lucide-react";

export const Route = createFileRoute("/portal/kunden/")({ component: Page });

function Page() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCustomers>>>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      listCustomers({ data: { q: q || undefined } })
        .then(setRows)
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Fehler"));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Stammdaten</p>
      <h1 className="mt-1 font-display text-4xl">Kunden</h1>
      <p className="mt-1 text-sm text-muted">
        Alle erfassten Kunden · Historie über die Aufträge
      </p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9"
          placeholder="Name, PLZ, Ort, Telefon…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {err && <p className="mt-4 text-danger">{err}</p>}

      <ul className="mt-4 space-y-2">
        {rows.length === 0 && !err && (
          <li className="rounded-2xl bg-surface p-8 text-center text-sm text-muted gold-hairline">
            {q ? "Keine Treffer." : "Noch keine Kunden. Über die Erfassung anlegen."}
          </li>
        )}
        {rows.map((c) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Kunde";
          const addr = [c.street, c.house_number, c.zip, c.city].filter(Boolean).join(" ");
          return (
            <li key={c.id}>
              <Link
                to="/portal/kunden/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 gold-hairline transition-colors hover:bg-elevated"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-elevated">
                  <User className="size-4 text-gold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className="truncate text-xs text-muted">
                    {addr || "Keine Adresse"}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </p>
                </div>
                {c.updated_at || c.created_at ? (
                  <span className="shrink-0 text-[10px] text-muted">
                    {deDate(c.updated_at || c.created_at)}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
