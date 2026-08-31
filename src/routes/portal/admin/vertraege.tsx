import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { previewMusterVertrag } from "@/lib/server/sign-api";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/admin/vertraege")({ component: Page });

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof previewMusterVertrag>> | null>(null);
  useEffect(() => {
    previewMusterVertrag().then(setData).catch(() => setData(null));
  }, []);
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Recht</p>
      <h1 className="mt-1 font-display text-4xl">Verträge</h1>
      <p className="mt-2 text-sm text-muted">
        Strom- und Gasliefervertrag nach EnWG, BGB, Widerruf (Haustür/Fernabsatz), SEPA, Datenschutz und AGB.
        Arbeitspreis, Grundpreis, HRB, Anschrift und Gläubiger-ID sind Platzhalter, bis die Tarife stehen.
        Vor dem Live-Einsatz kurz vom Anwalt gegenlesen lassen.
      </p>
      <Button
        className="mt-4"
        variant="outline"
        onClick={() => {
          if (!data) return;
          const a = document.createElement("a");
          a.href = `data:application/pdf;base64,${data.pdfBase64}`;
          a.download = "E1-Mustervertrag-Strom.pdf";
          a.click();
        }}
      >
        Muster-PDF herunterladen
      </Button>
      <pre className="mt-6 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-3xl bg-surface p-5 text-xs leading-relaxed gold-hairline">
        {data?.lines.join("\n") || "Laden…"}
      </pre>
    </div>
  );
}
