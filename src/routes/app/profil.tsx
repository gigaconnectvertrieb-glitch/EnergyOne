import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { bootstrapMe } from "@/lib/server/api";
import { workMail } from "@/lib/work-mail";
import { ROLE_LABELS } from "@/lib/e1";

export const Route = createFileRoute("/app/profil")({ component: Page });

function Page() {
  const [me, setMe] = useState<Awaited<ReturnType<typeof bootstrapMe>> | null>(null);
  useEffect(() => {
    bootstrapMe().then(setMe).catch(() => setMe(null));
  }, []);
  if (!me) return <p className="text-sm text-muted">Laden…</p>;
  const p = me.profile;
  const mail = p.email && p.email.includes("@e1direktvertrieb.de") ? p.email : workMail(p.first_name, p.last_name);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Konto</p>
      <h1 className="mt-1 font-display text-4xl">Profil</h1>
      <div className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <Row k="Name" v={`${p.first_name} ${p.last_name}`} />
        <Row k="Mitarbeiter-ID" v={p.staff_id || "—"} />
        <Row k="Firmenmail" v={mail || "—"} />
        <Row k="Rolle" v={ROLE_LABELS[p.role] || p.role} />
        <Row k="Stufe" v={String(p.commission_stufe || 1)} />
      </div>
      <p className="mt-4 text-xs text-muted">
        Postfach {mail || "vorname.nachname@e1direktvertrieb.de"} liegt in Google Workspace. Im Portal unter Postfach, sobald die Anbindung steht.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-gold">{k}</p>
      <p className="mt-0.5 text-sm">{v}</p>
    </div>
  );
}
