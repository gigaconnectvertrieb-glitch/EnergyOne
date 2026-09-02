import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { bootstrapMe, listNotifications } from "@/lib/server/api";
import { fieldBalance, getFieldHome } from "@/lib/server/field-api";
import { listDashboardContracts, revealContract } from "@/lib/server/vault-api";
import { WorkShift } from "@/components/work-shift";
import { PushEnable } from "@/components/push-enable";
import { AppUpdate } from "@/components/app-update";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export const Route = createFileRoute("/app/")({ component: Page });

function Page() {
  const [name, setName] = useState("");
  const [home, setHome] = useState<Awaited<ReturnType<typeof getFieldHome>> | null>(null);
  const [bal, setBal] = useState<Awaited<ReturnType<typeof fieldBalance>> | null>(null);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);
  const [deals, setDeals] = useState<Awaited<ReturnType<typeof listDashboardContracts>>>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [secret, setSecret] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    bootstrapMe()
      .then((m) => setName(`${m.profile.first_name} ${m.profile.last_name}`.trim()))
      .catch(() => setName(""));
    getFieldHome().then(setHome).catch(() => setHome(null));
    fieldBalance().then(setBal).catch(() => setBal(null));
    listNotifications()
      .then((n) => setNotes(n.slice(0, 4)))
      .catch(() => setNotes([]));
    listDashboardContracts().then(setDeals).catch(() => setDeals([]));
  }, []);
  const hour = new Date().getHours();
  const hi = hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Heute</p>
        <h1 className="mt-1 font-display text-4xl leading-none">{hi}</h1>
        <p className="mt-2 text-sm text-muted">{name || "Feld"}</p>
      </div>
      <AppUpdate />
      <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 gold-hairline">
        <p className="text-sm">Schicht</p>
        <WorkShift />
      </div>
      <PushEnable />
      {home?.pending ? (
        <Link to="/app/karte" className="rounded-2xl bg-gold px-4 py-4 text-sm font-medium text-bg">
          Gebiet bereit: {home.pending.name} — öffnen
        </Link>
      ) : home?.territory ? (
        <p className="text-sm text-muted">Gebiet {home.territory.name}</p>
      ) : (
        <p className="text-sm text-muted">Noch kein Gebiet. Orhan spielt auf.</p>
      )}
      {home?.yield ? (
        <div className="rounded-2xl bg-surface p-4 gold-hairline">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold">Abschöpfung</p>
          <p className="mt-1 font-display text-3xl">{home.yield.pct} %</p>
          <p className="mt-1 text-xs text-muted">
            {home.yield.deals} Abschlüsse · {home.yield.units} WE · {home.yield.houses} Häuser
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Heute" value={bal ? eur(bal.tag.eur) : "—"} sub={bal ? `${bal.tag.n} Abschluss` : ""} />
        <Stat label="Woche" value={bal ? eur(bal.woche.eur) : "—"} sub={bal ? `${bal.woche.n}` : ""} />
        <Stat label="Monat" value={bal ? eur(bal.monat.eur) : "—"} sub={bal ? `${bal.monat.n}` : ""} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Link to="/app/abschluss" className="rounded-2xl bg-gold px-3 py-4 text-center text-sm font-medium text-bg">
          Abschluss
        </Link>
        <Link to="/app/karte" className="rounded-2xl bg-surface px-3 py-4 text-center text-sm gold-hairline">
          Karte
        </Link>
        <Link to="/app/notfall" className="rounded-2xl bg-surface px-3 py-4 text-center text-sm text-red-400 gold-hairline">
          Notfall
        </Link>
      </div>
      {home && home.openFollowups > 0 ? (
        <Link to="/app/liste" className="text-sm text-gold">
          {home.openFollowups} offene Nachläufe
        </Link>
      ) : null}
      {deals.length ? (
        <div className="rounded-2xl bg-surface p-4 gold-hairline">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold">Abschlüsse</p>
          <ul className="mt-2 grid gap-2">
            {deals.map((d) => (
              <li key={d.id}>
                <button type="button" className="w-full text-left text-sm" onClick={() => { setOpenId(d.id); setSecret(null); setPw(""); }}>
                  <span className="font-medium">{d.name}</span>
                  <span className="block text-xs text-muted">{d.address} · {d.status}{d.locked ? " · gesperrt" : ""}</span>
                </button>
                {openId === d.id ? (
                  <div className="mt-2 grid gap-2">
                    {d.locked && !secret ? (
                      <>
                        <Input type="password" placeholder="Passwort der Aufnahme" value={pw} onChange={(e) => setPw(e.target.value)} />
                        <Button
                          onClick={async () => {
                            try {
                              setSecret(await revealContract({ data: { id: d.id, password: pw } }));
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Falsch");
                            }
                          }}
                        >
                          Daten zeigen
                        </Button>
                      </>
                    ) : null}
                    {secret ? (
                      <p className="text-xs text-muted">
                        {secret.firstName} {secret.lastName}
                        <br />
                        {secret.street} {secret.house}, {secret.zip} {secret.city}
                        <br />
                        {secret.phone} {secret.email}
                        <br />
                        IBAN {secret.iban || "—"} · {secret.bankOwner}
                      </p>
                    ) : !d.locked ? (
                      <p className="text-xs text-muted">Nicht gesperrt gespeichert.</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notes.length ? (
        <div className="rounded-2xl bg-surface p-4 gold-hairline">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold">Hinweise</p>
          <ul className="mt-2 grid gap-2 text-sm">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="text-ink">{n.title}</span>
                <span className="block text-xs text-muted">{n.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-3 gold-hairline">
      <p className="text-[10px] uppercase tracking-[0.16em] text-gold">{label}</p>
      <p className="mt-1 font-display text-lg tabular-nums">{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}
