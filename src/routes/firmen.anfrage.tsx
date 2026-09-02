import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { CheckboxRow, Field, Input, Textarea } from "@/components/ui/field";
import { submitLead } from "@/lib/server/public";
import { toast } from "sonner";

export const Route = createFileRoute("/firmen/anfrage")({ component: Page });

function Page() {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [kwh, setKwh] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <PublicShell variant="firmen">
      <div className="mx-auto max-w-xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Geschäftskunden</p>
        <h1 className="mt-2 font-display text-5xl">Gespräch vereinbaren.</h1>
        <p className="mt-3 text-muted">
          Die Anfrage geht an{" "}
          <a className="text-gold" href="mailto:info@e1direktvertrieb.de">
            info@e1direktvertrieb.de
          </a>{" "}
          und direkt an die Geschäftsführung.
        </p>
        <form
          className="mt-8 grid gap-3 rounded-3xl bg-surface p-6 gold-hairline"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await submitLead({
                data: {
                  name: name || company,
                  phone,
                  zip,
                  consent,
                  kind: "gewerbe",
                  company,
                  message: [email && `Mail: ${email}`, kwh && `Verbrauch: ${kwh} kWh`, message]
                    .filter(Boolean)
                    .join("\n"),
                },
              });
              toast.success("Anfrage bei der Geschäftsführung. Wir melden uns.");
              setCompany("");
              setName("");
              setPhone("");
              setEmail("");
              setZip("");
              setKwh("");
              setMessage("");
              setConsent(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Senden fehlgeschlagen");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Firma *">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} required />
          </Field>
          <Field label="Ansprechpartner *">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefon *">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <Field label="E-Mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="PLZ Standort">
              <Input value={zip} onChange={(e) => setZip(e.target.value)} />
            </Field>
            <Field label="Jahresverbrauch kWh">
              <Input inputMode="numeric" value={kwh} onChange={(e) => setKwh(e.target.value)} />
            </Field>
          </div>
          <Field label="Kurz zum Bedarf">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <CheckboxRow checked={consent} onChange={setConsent}>
            Einwilligung zur Kontaktaufnahme.{" "}
            <Link to="/datenschutz" className="text-gold">
              Datenschutz
            </Link>
          </CheckboxRow>
          <Button type="submit" disabled={busy}>
            Anfrage senden
          </Button>
        </form>
      </div>
    </PublicShell>
  );
}
