import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { beginTotp, bootstrapMe, confirmTotp, updateMyProfile } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/profil")({ component: Page });

function Page() {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    bootstrapMe().then((m) => {
      setFirst(m.profile.first_name);
      setLast(m.profile.last_name);
      setPhone(m.profile.phone || "");
      setEnabled(m.profile.totp_enabled);
    });
  }, []);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-4xl">Profil & 2FA</h1>
      <div className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <Field label="Vorname">
          <Input value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Nachname">
          <Input value={last} onChange={(e) => setLast(e.target.value)} />
        </Field>
        <Field label="Telefon">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Button
          onClick={async () => {
            await updateMyProfile({ data: { firstName: first, lastName: last, phone } });
            toast.success("Profil gespeichert");
          }}
        >
          Speichern
        </Button>
      </div>
      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <h2 className="font-medium">Zwei-Faktor (TOTP)</h2>
        <p className="mt-1 text-sm text-muted">
          Für Super-Admin und Backoffice Pflicht. Secret in Authenticator-App eintragen.
        </p>
        {enabled ? <p className="mt-3 text-success">2FA ist aktiv.</p> : null}
        <Button
          className="mt-3"
          variant="outline"
          onClick={async () => setTotp(await beginTotp())}
        >
          Secret erzeugen
        </Button>
        {totp ? (
          <div className="mt-3 text-sm">
            <p className="break-all font-mono text-gold">{totp.secret}</p>
            <p className="mt-2 break-all text-xs text-muted">{totp.uri}</p>
            <Field label="Bestätigungscode">
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button
              className="mt-2"
              onClick={async () => {
                try {
                  await confirmTotp({ data: code });
                  toast.success("2FA aktiv");
                  setEnabled(true);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Ungültig");
                }
              }}
            >
              Aktivieren
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
