/**
 * E1 Kundendetail
 * ---------------
 * Stammdaten, Verträge, Postfach, DSGVO.
 *
 * Ersetzt: src/routes/portal/kunden/$id.tsx
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCustomer, gdprEraseCustomer } from "@/lib/server/api";
import { listThreads } from "@/lib/server/mailbox-api";
import { deDate } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import type { ContractStatus } from "@/lib/e1";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronLeft, Mail, Phone, MapPin, Plus } from "lucide-react";

export const Route = createFileRoute("/portal/kunden/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getCustomer>> | null>(null);
  const [mails, setMails] = useState<Awaited<ReturnType<typeof listThreads>>["threads"]>([]);

  useEffect(() => {
    getCustomer({ data: id })
      .then(setData)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
    listThreads({ data: { customerId: id, folder: "inbox" } })
      .then((r) => setMails(r.threads || []))
      .catch(() => setMails([]));
  }, [id]);

  if (!data) {
    return <div className="mx-auto max-w-2xl h-32 animate-pulse rounded-3xl bg-surface" />;
  }

  const c = data.customer;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/portal/kunden"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold"
      >
        <ChevronLeft className="size-4" />
        Kunden
      </Link>

      <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-gold">Kunde</p>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl">
        {c.first_name} {c.last_name}
      </h1>

      <div className="mt-4 space-y-2 text-sm">
        {(c.street || c.city) && (
          <p className="flex items-start gap-2 text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>
              {c.street} {c.house_number}
              {(c.zip || c.city) && (
                <>
                  <br />
                  {c.zip} {c.city}
                </>
              )}
            </span>
          </p>
        )}
        {c.phone && (
          <p className="flex items-center gap-2">
            <Phone className="size-4 shrink-0 text-gold" />
            <a href={`tel:${c.phone}`} className="hover:text-gold">
              {c.phone}
            </a>
          </p>
        )}
        {c.email && (
          <p className="flex items-center gap-2">
            <Mail className="size-4 shrink-0 text-gold" />
            <a href={`mailto:${c.email}`} className="hover:text-gold">
              {c.email}
            </a>
          </p>
        )}
        {c.birth_date && (
          <p className="text-muted">Geboren {deDate(c.birth_date)}</p>
        )}
      </div>

      <div className="mt-6">
        <Link
          to="/portal/auftraege/neu"
          search={
            {
              first: c.first_name,
              last: c.last_name,
              phone: c.phone || undefined,
              email: c.email || undefined,
              street: c.street || undefined,
              house: c.house_number || undefined,
              zip: c.zip || undefined,
              city: c.city || undefined,
            } as never
          }
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-medium text-bg"
        >
          <Plus className="size-4" />
          Neuer Auftrag für diesen Kunden
        </Link>
      </div>

      <h2 className="mt-8 text-sm font-medium">Verträge</h2>
      <div className="mt-2 grid gap-2">
        {(data.contracts || []).length === 0 && (
          <p className="rounded-2xl bg-surface p-5 text-sm text-muted gold-hairline">
            Noch keine Verträge
          </p>
        )}
        {(data.contracts || []).map((x) => (
          <Link
            key={x.id}
            to="/portal/auftraege/$id"
            params={{ id: x.id }}
            className="flex items-center justify-between rounded-2xl bg-surface p-4 gold-hairline transition-colors hover:bg-elevated"
          >
            <span>
              <span className="font-medium">{x.product_name || x.type}</span>
              <span className="block text-xs text-muted">
                {x.type}
                {x.created_at ? ` · ${deDate(x.created_at)}` : ""}
              </span>
            </span>
            <StatusBadge status={x.status as ContractStatus} />
          </Link>
        ))}
      </div>

      {mails.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-medium">Postfach</h2>
          <div className="mt-2 grid gap-2">
            {mails.map((m) => (
              <Link
                key={m.id}
                to="/portal/postfach/$id"
                params={{ id: m.id }}
                className="rounded-2xl bg-surface p-4 text-sm gold-hairline transition-colors hover:bg-elevated"
              >
                <p className="font-medium">{m.subject}</p>
                <p className="text-xs text-muted line-clamp-2">{m.snippet}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 border-t border-line pt-6">
        <p className="text-xs text-muted">Datenschutz</p>
        <Button
          variant="outline"
          className="mt-2 text-danger"
          onClick={async () => {
            if (!confirm("Personenbezogene Daten unwiderruflich anonymisieren?")) return;
            try {
              await gdprEraseCustomer({ data: id });
              toast.success("DSGVO-Löschung ausgeführt");
              getCustomer({ data: id }).then(setData);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Fehler");
            }
          }}
        >
          Daten anonymisieren (DSGVO)
        </Button>
      </div>
    </div>
  );
}
