import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { CheckboxRow, Field, Input, Select, Textarea } from "@/components/ui/field";
import { submitApplication } from "@/lib/server/public";
import { toast } from "sonner";

export const Route = createFileRoute("/karriere")({ component: Page });

function Page() {
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("Vertriebsmitarbeiter (m/w/d)");
  const [motivation, setMotivation] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <PublicShell>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gold">Karriere</p>
          <h1 className="mt-2 font-display text-5xl">Verkaufen, ohne sich zu verbiegen.</h1>
          <p className="mt-4 text-muted">
            Bei E1 zählt, was Sie erreichen – nicht, wem Sie folgen. Eigenverantwortlich,
            persönlich von der Geschäftsführung begleitet, fair bezahlt. Bewerbungen landen
            direkt bei{" "}
            <a className="text-gold" href="mailto:bewerbung@e1direktvertrieb.de">
              bewerbung@e1direktvertrieb.de
            </a>
            .
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              ["Eigenverantwortung", "Wir geben den Rahmen, nicht die Kontrolle."],
              ["Faire Provision", "Transparent, stufenbasiert, live im Portal."],
              ["Direkter Draht", "Sie sprechen mit der Geschäftsführung, nicht mit HR."],
              ["Echtes Wachstum", "Coaching, Schulung, Möglichkeit zum eigenen Team."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl bg-surface p-4 gold-hairline">
                <p className="font-medium text-gold">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
        <form
          className="rounded-3xl bg-surface p-6 gold-hairline"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await submitApplication({
                data: { firstName, lastName, email, phone, position, motivation, consent },
              });
              toast.success("Bewerbung gesendet. Wir melden uns persönlich.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Fehler");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="font-display text-3xl">Bewirb dich jetzt</h2>
          <p className="mb-4 text-sm text-muted">Kein Anschreiben nötig. Ein paar Zeilen reichen.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vorname *">
              <Input value={firstName} onChange={(e) => setFirst(e.target.value)} required />
            </Field>
            <Field label="Nachname *">
              <Input value={lastName} onChange={(e) => setLast(e.target.value)} required />
            </Field>
            <Field label="E-Mail *">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Telefon *">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
          </div>
          <div className="mt-3 grid gap-3">
            <Field label="Bewerbung für">
              <Select value={position} onChange={(e) => setPosition(e.target.value)}>
                <option>Vertriebsmitarbeiter (m/w/d)</option>
                <option>Freier Handelsvertreter (§ 84 HGB)</option>
                <option>Teamleitung</option>
                <option>Backoffice</option>
              </Select>
            </Field>
            <Field label="Nachricht / Motivation *">
              <Textarea value={motivation} onChange={(e) => setMotivation(e.target.value)} required />
            </Field>
            <CheckboxRow checked={consent} onChange={setConsent}>
              Datenverarbeitung zur Bewerbung. <Link to="/datenschutz" className="text-gold">Datenschutz</Link>
            </CheckboxRow>
            <Button type="submit" disabled={busy}>
              Bewerbung absenden
            </Button>
          </div>
        </form>
      </div>
    </PublicShell>
  );
}
