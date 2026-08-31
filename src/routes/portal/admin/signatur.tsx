import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSignStatus } from "@/lib/server/sign-api";
import { SIGN_STATUS_LABELS } from "@/lib/sign";

export const Route = createFileRoute("/portal/admin/signatur")({ component: Page });

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getSignStatus>> | null>(null);
  useEffect(() => {
    getSignStatus().then(setData).catch(() => setData(null));
  }, []);
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">System</p>
      <h1 className="mt-1 font-display text-4xl">Unterschrift</h1>
      <p className="mt-2 text-sm text-muted">
        Vor Ort auf dem Tablet. Oder per E-Mail über DocuSign — der Kunde unterschreibt, das PDF kommt von selbst in den Auftrag.
      </p>
      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-sm font-medium">DocuSign</p>
        <p className="mt-2 text-sm">
          {data?.ready ? "Verbunden. Versand per E-Mail ist aktiv." : "Keys fehlen. Tablet-Unterschrift geht trotzdem."}
        </p>
        <ul className="mt-3 grid gap-1 text-sm text-muted">
          {(data?.env_keys || []).map((k) => (
            <li key={k}>
              {k} · {data?.missing.includes(k) ? "fehlt" : "gesetzt"}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          In DocuSign Connect auf <span className="text-gold">/api/docusign/connect</span> zeigen. Keys nur in Render Environment Variables.
        </p>
      </div>
      <div className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-sm font-medium">Ablauf</p>
        <ol className="mt-2 list-decimal pl-5 text-sm text-muted">
          <li>Auftrag anlegen (Name, Adresse, Tarif, Telefon).</li>
          <li>Vor Ort: Tablet, Kunde unterschreibt.</li>
          <li>Nicht vor Ort: E-Mail rausschicken, Kunde unterschreibt bei DocuSign.</li>
          <li>Webhook erkennt fertig → PDF wird hochgeladen und am Auftrag gespeichert.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          Status: {Object.values(SIGN_STATUS_LABELS).join(" · ")}
        </p>
      </div>
    </div>
  );
}
