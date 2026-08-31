import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public-shell";
import { agbBlock, fillVertrag } from "@/lib/vertrag";

export const Route = createFileRoute("/agb")({ component: Page });

function Page() {
  const hint = fillVertrag({
    art: "strom",
    first: "",
    last: "",
    street: "",
    house: "",
    zip: "",
    city: "",
    email: "",
    phone: "",
    product: "",
    kwh: "",
    advisor: "",
  }).slice(0, 6);
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-display text-5xl">AGB</h1>
        <p className="mt-4 text-sm text-muted">
          Entwurf. Preise und Gesellschaftsangaben Platzhalter bis zur Freigabe. Der unterschriebene
          Vertrag am Tablet oder per DocuSign gilt im Einzelfall.
        </p>
        <div className="mt-8 space-y-3 text-sm leading-relaxed text-muted">
          {hint.map((l, i) => (
            <p key={`h-${i}`}>{l}</p>
          ))}
          {agbBlock().map((l, i) =>
            l.startsWith("ANLAGE") || /^\d+\./.test(l) ? (
              <h2 key={`a-${i}`} className="pt-4 font-display text-xl text-ink">
                {l}
              </h2>
            ) : (
              <p key={`a-${i}`}>{l}</p>
            ),
          )}
        </div>
      </div>
    </PublicShell>
  );
}
