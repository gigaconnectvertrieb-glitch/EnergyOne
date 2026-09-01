import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { CheckboxRow, Field, Input, Textarea } from "@/components/ui/field";
import { getPublicContact, submitLead } from "@/lib/server/public";
import { formatPhone, telHref } from "@/lib/contact";
import { toast } from "sonner";

export const Route = createFileRoute("/beratung")({ component: Page });

function Page() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [office, setOffice] = useState("");
  useEffect(() => {
    getPublicContact()
      .then((c) => setOffice(c.phone || ""))
      .catch(() => setOffice(""));
  }, []);

  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Unverbindlich</p>
        <h1 className="mt-2 font-display text-5xl">Beratung anfordern</h1>
        <p className="mt-3 text-muted">
          Wir kommen zu Ihnen. Kein Skript, keine Hotline.
          {office ? " Oder Sie rufen uns direkt an." : ""}
        </p>
        {office ? (
          <p className="mt-4">
            <a className="text-gold" href={telHref(office)}>
              Anrufen · {formatPhone(office) || office}
            </a>
            <span className="ml-2 text-sm text-muted">Satellite-Festnetz</span>
          </p>
        ) : null}
        <form
          className="mt-8 grid gap-3 rounded-3xl bg-surface p-6 gold-hairline"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await submitLead({ data: { name, phone, zip, message, consent } });
              toast.success("Danke. Wir rufen persönlich zurück.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Fehler");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Telefon">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <Field label="PLZ">
            <Input value={zip} onChange={(e) => setZip(e.target.value)} />
          </Field>
          <Field label="Nachricht">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <CheckboxRow checked={consent} onChange={setConsent}>
            Einwilligung zur Kontaktaufnahme. <Link to="/datenschutz" className="text-gold">Datenschutz</Link>
          </CheckboxRow>
          <Button type="submit" disabled={busy}>
            Anfrage senden
          </Button>
        </form>
      </div>
    </PublicShell>
  );
}
