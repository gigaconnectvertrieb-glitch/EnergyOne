import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { customerSelfLookup } from "@/lib/server/public";
import { STATUS_LABELS, type ContractStatus } from "@/lib/e1";
import { toast } from "sonner";

export const Route = createFileRoute("/kunde")({ component: Page });

function Page() {
  const [lastName, setLast] = useState("");
  const [zip, setZip] = useState("");
  const [contractId, setId] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof customerSelfLookup>> | null>(null);

  return (
    <main className="min-h-dvh gold-wash px-4 py-12">
      <div className="mx-auto max-w-md">
        <Wordmark />
        <h1 className="mt-8 font-display text-4xl">Kundenportal</h1>
        <p className="mt-2 text-sm text-muted">
          Phase 2 – Vertrag einsehen. Aktiv, sobald Super-Admin das Feature-Flag setzt.
        </p>
        <form
          className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setResult(await customerSelfLookup({ data: { lastName, zip, contractId } }));
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Nicht gefunden");
              setResult(null);
            }
          }}
        >
          <Field label="Nachname">
            <Input value={lastName} onChange={(e) => setLast(e.target.value)} required />
          </Field>
          <Field label="PLZ">
            <Input value={zip} onChange={(e) => setZip(e.target.value)} required />
          </Field>
          <Field label="Auftragsnummer">
            <Input value={contractId} onChange={(e) => setId(e.target.value)} required />
          </Field>
          <Button type="submit">Vertrag anzeigen</Button>
        </form>
        {result ? (
          <div className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
            <p className="font-medium">{result.name}</p>
            <p className="text-sm text-muted">
              {result.product_name} · {result.type} · {STATUS_LABELS[result.status as ContractStatus] ?? result.status}
            </p>
            <p className="text-sm text-muted">{result.city}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
