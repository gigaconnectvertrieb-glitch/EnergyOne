import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { gdprEraseCustomer, getCustomer } from "@/lib/server/api";
import { listThreads } from "@/lib/server/mailbox-api";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { deDate } from "@/lib/utils";
import { toast } from "sonner";
import type { ContractStatus } from "@/lib/e1";

export const Route = createFileRoute("/portal/kunden/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getCustomer>> | null>(null);
  const [mails, setMails] = useState<Awaited<ReturnType<typeof listThreads>>["threads"]>([]);
  useEffect(() => {
    getCustomer({ data: id }).then(setData).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
    listThreads({ data: { customerId: id, folder: "inbox" } })
      .then((r) => setMails(r.threads))
      .catch(() => setMails([]));
  }, [id]);
  if (!data) return <div className="h-32 animate-pulse rounded-3xl bg-surface" />;
  const c = data.customer;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl">
        {c.first_name} {c.last_name}
      </h1>
      <p className="text-sm text-muted">
        {c.street} {c.house_number}, {c.zip} {c.city}
      </p>
      <p className="text-sm text-muted">
        {c.phone} · {c.email} · geb. {deDate(c.birth_date)}
      </p>
      <h2 className="mt-8 font-display text-2xl">Verträge</h2>
      <div className="mt-3 grid gap-2">
        {data.contracts.map((x) => (
          <Link
            key={x.id}
            to="/portal/auftraege/$id"
            params={{ id: x.id }}
            className="flex items-center justify-between rounded-2xl bg-surface p-4 gold-hairline"
          >
            <span>
              {x.product_name} · {x.type}
              <span className="block text-xs text-muted">{deDate(x.created_at)}</span>
            </span>
            <StatusBadge status={x.status as ContractStatus} />
          </Link>
        ))}
      </div>
      {mails.length ? (
        <>
          <h2 className="mt-8 font-display text-2xl">Postfach</h2>
          <div className="mt-3 grid gap-2">
            {mails.map((m) => (
              <Link
                key={m.id}
                to="/portal/postfach/$id"
                params={{ id: m.id }}
                className="rounded-2xl bg-surface p-4 text-sm gold-hairline"
              >
                <p className="font-medium">{m.subject}</p>
                <p className="text-xs text-muted">{m.snippet}</p>
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <Button
        variant="danger"
        className="mt-8"
        onClick={async () => {
          if (!confirm("Personenbezogene Daten unwiderruflich anonymisieren?")) return;
          try {
            await gdprEraseCustomer({ data: id });
            toast.success("DSGVO-Löschung ausgeführt");
            getCustomer({ data: id }).then(setData);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Keine Berechtigung");
          }
        }}
      >
        DSGVO-Löschung
      </Button>
    </div>
  );
}
