import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMailSecurity, getOpsSettings, listFlags, saveOpsSettings, setFlag } from "@/lib/server/api";
import { AuthChip } from "@/components/mail-status";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export const Route = createFileRoute("/portal/admin/einstellungen")({ component: Page });

function Page() {
  const [flags, setFlags] = useState<Awaited<ReturnType<typeof listFlags>>>([]);
  const [mail, setMail] = useState<Awaited<ReturnType<typeof getMailSecurity>> | null>(null);
  const [ops, setOps] = useState<Awaited<ReturnType<typeof getOpsSettings>> | null>(null);
  function load() {
    listFlags().then(setFlags);
    getMailSecurity().then(setMail).catch(() => setMail(null));
    getOpsSettings().then(setOps).catch(() => setOps(null));
  }
  useEffect(load, []);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl">System & Feature-Flags</h1>
      <p className="text-sm text-muted">
        Bei der Geschäftsführung ist alles frei. Mitarbeiter-Module schaltet ihr live unter Benutzer auf die ID.
      </p>
      {mail ? (
        <Link
          to="/portal/admin/mail"
          className="mt-6 block rounded-3xl bg-surface p-5 gold-hairline"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Pflicht</p>
          <p className="mt-1 font-medium">E-Mail-Sicherheit · {mail.domain}</p>
          <p className="mt-1 text-sm text-muted">
            SPF, DKIM und DMARC über DNS und Google Workspace. Render hostet nur die App.
            {mail.ready ? " Versand ist freigegeben." : " Versand bleibt gesperrt, bis alle drei auf ok stehen."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="flex items-center gap-2 text-xs text-muted">
              SPF <AuthChip state={mail.spf_status} />
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              DKIM <AuthChip state={mail.dkim_status} />
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              DMARC <AuthChip state={mail.dmarc_status} />
            </span>
          </div>
        </Link>
      ) : null}
      {ops ? (
        <form
          className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const next = await saveOpsSettings({ data: ops });
              setOps(next);
              toast.success("Betriebseinstellungen gespeichert");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Keine Berechtigung");
            }
          }}
        >
          <h2 className="font-medium">Betrieb</h2>
          <Field label="2FA-Pflicht">
            <Select
              value={ops.require_2fa}
              onChange={(e) => setOps({ ...ops, require_2fa: e.target.value })}
            >
              <option value="off">aus</option>
              <option value="admins">Super-Admin und Backoffice</option>
              <option value="all">alle Rollen</option>
            </Select>
          </Field>
          <Field label="New Sales" hint="Kein Versand. Verträge entstehen dort, Teamleiter prüft dort.">
            <Input value="Verträge in New Sales · Portal nur Kurz-Eintrag" readOnly />
          </Field>
          <Field label="Storno-Warnung ab Quote">
            <Input
              value={ops.quality_warn_rate}
              onChange={(e) => setOps({ ...ops, quality_warn_rate: e.target.value })}
            />
          </Field>
          <Field label="Auto-Sperre ab Quote">
            <Input
              value={ops.quality_block_rate}
              onChange={(e) => setOps({ ...ops, quality_block_rate: e.target.value })}
            />
          </Field>
          <Button type="submit">Speichern</Button>
        </form>
      ) : null}
      <div className="mt-6 grid gap-2">
        {flags.map((f) => (
          <label key={f.key} className="flex items-start gap-3 rounded-2xl bg-surface p-4 gold-hairline">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-[#c9a227]"
              checked={Boolean(f.enabled)}
              onChange={async (e) => {
                try {
                  await setFlag({ data: { key: f.key, enabled: e.target.checked } });
                  toast.success(f.label);
                  load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Keine Berechtigung");
                }
              }}
            />
            <span>
              <span className="block font-medium">
                {f.label} <span className="text-xs text-gold">Phase {f.phase}</span>
              </span>
              <span className="text-sm text-muted">{f.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
