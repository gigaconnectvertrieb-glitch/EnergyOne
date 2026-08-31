import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addMailIdentity,
  checkMailDns,
  getMailSecurity,
  runWorkspaceJobs,
  testMailSend,
  toggleMailIdentity,
  updateMailSecurity,
} from "@/lib/server/api";
import {
  AUTH_STATES,
  DMARC_POLICIES,
  DMARC_POLICY_LABELS,
  DMARC_ROLLOUT,
  KIND_LABELS,
  MAILBOX_TYPE_LABELS,
  SETUP_STEPS,
  WORKSPACE_STATUS_LABELS,
  type AuthState,
  type DmarcPolicy,
  type MailIdentityKind,
  type MailboxType,
  type WorkspaceAccountStatus,
} from "@/lib/mail";
import { HOSTING_SPLIT } from "@/lib/hosting";
import { AuthChip } from "@/components/mail-status";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { deDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Copy, ShieldAlert, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/portal/admin/mail")({ component: Page });

type MailData = Awaited<ReturnType<typeof getMailSecurity>>;

const JOB_LABELS: Record<string, string> = {
  create_user: "Konto anlegen",
  suspend_user: "Konto sperren",
  unsuspend_user: "Konto entsperren",
  ensure_shared: "Shared-Postfach",
  send_mail: "Mail senden",
};

function Page() {
  const [data, setData] = useState<MailData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [testFrom, setTestFrom] = useState("info@e1direktvertrieb.de");
  const [testPurpose, setTestPurpose] = useState("Portal-Test");
  const [probeNote, setProbeNote] = useState<string | null>(null);

  async function load() {
    try {
      const next = await getMailSecurity();
      setData(next);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Kein Zugriff");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeSenders = useMemo(
    () => (data ? data.identities.filter((i) => i.active) : []),
    [data],
  );
  const shared = useMemo(
    () => (data ? data.identities.filter((i) => i.mailbox_type === "shared") : []),
    [data],
  );
  const people = useMemo(
    () => (data ? data.identities.filter((i) => i.mailbox_type === "user") : []),
    [data],
  );

  async function copy(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    toast.success("Kopiert");
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  async function save(patch: {
    dmarc_policy?: DmarcPolicy;
    report_to?: string;
    spf_status?: AuthState;
    dkim_status?: AuthState;
    dmarc_status?: AuthState;
  }) {
    setBusy(true);
    try {
      const next = await updateMailSecurity({ data: patch });
      setData(next);
      toast.success("Gespeichert");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-4xl">Google Workspace</h1>
        <p className="mt-4 text-danger">{err}</p>
      </div>
    );
  }
  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-surface" />;

  const ws = data.workspace;

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <p className="text-xs uppercase tracking-[0.22em] text-gold">Hosting</p>
      <h1 className="mt-1 font-display text-4xl">Render + Google Workspace</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Render hostet nur Portal und API. Google Workspace bleibt das Mailsystem.
        Kein Mailserver auf Render. API-Keys nur in Environment Variables. Mitarbeiter-Passwörter
        bleiben in Workspace.
      </p>
      <Link to="/portal/postfach" className="mt-4 inline-flex min-h-11 items-center text-sm text-gold">
        Zum Firmenpostfach — Senden und Empfangen
      </Link>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {(Object.values(HOSTING_SPLIT) as Array<(typeof HOSTING_SPLIT)[keyof typeof HOSTING_SPLIT]>).map((side) => (
          <div key={side.title} className="rounded-3xl bg-surface p-5 gold-hairline">
            <p className="text-xs uppercase tracking-[0.16em] text-gold">{side.role}</p>
            <h2 className="mt-1 font-display text-2xl">{side.title}</h2>
            <ul className="mt-3 grid gap-1.5 text-sm text-ink">
              {side.does.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <ul className="mt-3 grid gap-1.5 text-sm text-muted">
              {side.does_not.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">DNS bei Squarespace</p>
        <p className="mt-2 text-sm text-muted">
          Nameserver sind Squarespace. MX zeigt schon auf Google. DKIM-Schlüssel steht schon im DNS.
          Noch tun: SPF auf -all stellen und DMARC anlegen. Danach hier „DNS prüfen“.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Squarespace → Domains → e1direktvertrieb.de → DNS</li>
          <li>
            TXT <span className="font-mono text-gold">@</span> auf{" "}
            <span className="font-mono text-gold">v=spf1 include:_spf.google.com -all</span> ändern (~all raus)
          </li>
          <li>
            Neuer TXT-Host <span className="font-mono text-gold">_dmarc</span>, Wert:
            <span className="mt-1 block break-all font-mono text-xs text-gold">
              v=DMARC1; p=none; sp=none; rua=mailto:dmarc@e1direktvertrieb.de; ruf=mailto:orhan.salo@e1direktvertrieb.de,mailto:luca.marrancone@e1direktvertrieb.de; fo=1; adkim=s; aspf=s; pct=100; ri=86400;
            </span>
          </li>
          <li>Google Admin → Apps → Gmail → Authentifizierung der E-Mails → DKIM „Authentifizierung starten“, falls noch aus</li>
        </ol>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <ConnCard
          title="Render"
          ok
          hint="App und API. Kein Mailserver."
        />
        <ConnCard
          title="Admin SDK"
          ok={ws.admin_sdk}
          hint={ws.admin_sdk ? "Service-Account verbunden" : "User anlegen und sperren über Render"}
        />
        <ConnCard
          title="Gmail API"
          ok={ws.gmail_api}
          hint={ws.gmail_api ? "Senden und Empfangen im Auftrag des Portals" : "Feature-Flag + Delegation"}
        />
      </div>
      <div className="mt-3 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Environment Variables</p>
        <p className="mt-1 text-sm text-muted">
          Nur auf Render, nie in der Datenbank. Werte werden hier nicht angezeigt.
        </p>
        <ul className="mt-3 grid gap-1 font-mono text-xs text-ink">
          {ws.env_keys.map((key) => (
            <li key={key}>
              {key}
              {ws.missing.includes(key) ? (
                <span className="ml-2 text-warn">fehlt</span>
              ) : (
                <span className="ml-2 text-success">gesetzt</span>
              )}
            </li>
          ))}
          {ws.optional_keys.map((key) => (
            <li key={key} className="text-muted">
              {key} <span className="text-muted">optional</span>
            </li>
          ))}
        </ul>
      </div>
      {!ws.connected ? (
        <p className="mt-3 text-xs text-muted">
          Zugangsdaten stehen in den Render Environment Variables, nicht in der Datenbank.
          Jobs laufen, sobald Service-Account und Feature-Flag gesetzt sind. Render sendet
          und empfängt nur im Auftrag des Portals.
        </p>
      ) : null}

      <div
        className={`mt-6 rounded-3xl p-5 ${data.ready ? "bg-surface gold-hairline" : "bg-danger/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_35%,transparent)]"}`}
      >
        <div className="flex items-start gap-3">
          {data.ready ? (
            <ShieldCheck className="mt-0.5 size-5 text-success" />
          ) : (
            <ShieldAlert className="mt-0.5 size-5 text-danger" />
          )}
          <div>
            <p className="font-medium">
              {data.ready
                ? "Versand freigegeben — SPF, DKIM und DMARC sind ok."
                : "Versand gesperrt"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {data.ready
                ? "Alle Firmen- und Mitarbeiterpostfächer werden über Google Workspace signiert."
                : data.block_reason}
            </p>
            {data.last_checked_at ? (
              <p className="mt-1 text-xs text-muted">Zuletzt geprüft {deDateTime(data.last_checked_at)}</p>
            ) : (
              <p className="mt-1 text-xs text-muted">Noch nicht gegen Live-DNS geprüft.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatusCard
          title="SPF"
          hint="include:_spf.google.com -all"
          state={data.spf_status}
          disabled={busy}
          onChange={(spf_status) => save({ spf_status })}
        />
        <StatusCard
          title="DKIM"
          hint="google._domainkey"
          state={data.dkim_status}
          disabled={busy}
          onChange={(dkim_status) => save({ dkim_status })}
        />
        <StatusCard
          title="DMARC"
          hint="Was bei Fälschungen"
          state={data.dmarc_status}
          disabled={busy}
          onChange={(dmarc_status) => save({ dmarc_status })}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await checkMailDns();
              const { probe, ...security } = next;
              setData(security);
              setProbeNote(
                probe.error
                  ? probe.error
                  : `Live-DNS: SPF ${probe.spf} · DKIM ${probe.dkim} · DMARC ${probe.dmarc} · MX ${probe.mx}`,
              );
              toast.success("DNS geprüft");
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "DNS-Prüfung fehlgeschlagen");
            } finally {
              setBusy(false);
            }
          }}
        >
          Live-DNS prüfen
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            save({
              spf_status: "fehlt",
              dkim_status: "fehlt",
              dmarc_status: "fehlt",
            })
          }
        >
          Status zurücksetzen
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await runWorkspaceJobs();
              setData(next);
              toast.success(
                next.results.length
                  ? `${next.results.length} Workspace-Jobs verarbeitet`
                  : "Keine offenen Jobs",
              );
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Jobs fehlgeschlagen");
            } finally {
              setBusy(false);
            }
          }}
        >
          Workspace-Jobs ausführen
        </Button>
      </div>
      {probeNote ? <p className="mt-2 text-xs text-muted">{probeNote}</p> : null}

      <section className="mt-10">
        <h2 className="font-display text-3xl">Shared-Postfächer</h2>
        <p className="mt-1 text-sm text-muted">
          Google Groups mit Collaborative Inbox. Nicht Exchange, nicht Microsoft 365.
        </p>
        <div className="mt-4 grid gap-2">
          {shared.map((ident) => (
            <IdentityRow
              key={ident.id}
              ident={ident}
              busy={busy}
              onToggle={async () => {
                setBusy(true);
                try {
                  setData(await toggleMailIdentity({ data: { id: ident.id, active: !ident.active } }));
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Fehler");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl">Persönliche Postfächer</h2>
        <p className="mt-1 text-sm text-muted">
          orhan.salo@, luca.marrancone@ und vorname.nachname@. Neu angelegte Mitarbeiter erzeugen
          einen Admin-SDK-Job; Deaktivierung sperrt das Workspace-Konto.
        </p>
        <div className="mt-4 grid gap-2">
          {people.map((ident) => (
            <IdentityRow
              key={ident.id}
              ident={ident}
              busy={busy}
              onToggle={async () => {
                setBusy(true);
                try {
                  setData(await toggleMailIdentity({ data: { id: ident.id, active: !ident.active } }));
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Fehler");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ))}
        </div>
        <form
          className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const next = await addMailIdentity({
                data: { firstName, lastName, kind: "personal" as MailIdentityKind },
              });
              setData(next);
              setFirstName("");
              setLastName("");
              toast.success("Postfach vorbereitet — Workspace-Job in der Warteschlange");
            } catch (err2: unknown) {
              toast.error(err2 instanceof Error ? err2.message : "Fehler");
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="sm:col-span-2 text-sm font-medium">Mitarbeiter-Postfach (vorname.nachname)</p>
          <Field label="Vorname">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label="Nachname">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !firstName || !lastName}>
              Anlegen und Workspace-Job erzeugen
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl">Provisionierung</h2>
        <p className="mt-1 text-sm text-muted">
          Jobs: Konto anlegen, sperren, Shared-Group, Versand. Automatisch, sobald das Flag an ist
          und der Service-Account steht.
        </p>
        <div className="mt-4 grid gap-2">
          {data.jobs.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Workspace-Jobs.</p>
          ) : (
            data.jobs.map((job) => (
              <div key={job.id} className="rounded-2xl bg-surface p-4 text-sm gold-hairline">
                <p className="font-medium">
                  {JOB_LABELS[job.action] ?? job.action} · {job.local_part}@e1direktvertrieb.de
                </p>
                <p className="text-xs text-muted">
                  {job.status}
                  {job.error ? ` — ${job.error}` : ""}
                </p>
                <p className="text-xs text-muted">{deDateTime(job.created_at)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl">DMARC-Policy</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Mailanbieter" hint="Fest: Google Workspace">
            <Input value="Google Workspace" readOnly />
          </Field>
          <Field label="DMARC-Policy" hint="Start none, dann quarantine, später reject">
            <Select
              value={data.dmarc_policy}
              disabled={busy}
              onChange={(e) => save({ dmarc_policy: e.target.value as DmarcPolicy })}
            >
              {DMARC_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {DMARC_POLICY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Aggregate-Reports (rua)" hint="Standard: dmarc@e1direktvertrieb.de">
            <Input
              defaultValue={data.report_to}
              key={data.report_to}
              disabled={busy}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== data.report_to) save({ report_to: v });
              }}
            />
          </Field>
          <Field label="Forensik-Reports (ruf)" hint="Fest an die Gründer-Postfächer">
            <Input value="orhan.salo@, luca.marrancone@" readOnly />
          </Field>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {DMARC_ROLLOUT.map((step) => (
            <li
              key={step.policy}
              className={`rounded-2xl bg-surface p-4 text-sm gold-hairline ${data.dmarc_policy === step.policy ? "shadow-[0_0_0_1px_var(--color-gold)]" : ""}`}
            >
              <p className="text-xs uppercase tracking-[0.16em] text-gold">{step.when}</p>
              <p className="mt-1 font-medium">p={step.policy}</p>
              <p className="mt-1 text-muted">{step.note}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl">DNS-Einträge</h2>
        <p className="mt-1 text-sm text-muted">
          1:1 beim Domain-Registrar. DKIM-Schlüssel aus Google Admin → Gmail → Authentifizierung.
        </p>
        <div className="mt-4 grid gap-2">
          {data.records.map((r, i) => {
            const key = `${r.purpose}-${r.host}-${i}`;
            const line =
              r.type === "MX"
                ? `${r.host} ${r.type} ${r.priority ?? 0} ${r.value}`
                : `${r.host} ${r.type} ${r.value}`;
            return (
              <div key={key} className="rounded-2xl bg-surface p-4 gold-hairline">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-gold">
                      {r.purpose.toUpperCase()} · {r.type}
                      {r.priority != null ? ` ${r.priority}` : ""}
                    </p>
                    <p className="mt-1 font-medium">{r.host}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => copy(key, r.value)}
                  >
                    {copied === key ? <Check className="size-4" /> : <Copy className="size-4" />}
                    Kopieren
                  </Button>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-elevated p-3 text-xs text-ink">
                  {r.value}
                </pre>
                <p className="mt-2 text-xs text-muted">{r.hint}</p>
                <p className="mt-1 hidden text-xs text-muted sm:block">{line}</p>
              </div>
            );
          })}
        </div>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() =>
            copy(
              "all",
              data.records
                .map((r) =>
                  [r.type, r.host, r.priority != null ? String(r.priority) : "", r.value]
                    .filter(Boolean)
                    .join("\t"),
                )
                .join("\n"),
            )
          }
        >
          Alle Einträge kopieren
        </Button>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl">So setzen Sie es</h2>
        <ol className="mt-4 grid gap-2">
          {SETUP_STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl bg-surface p-4 gold-hairline">
              <p className="text-xs uppercase tracking-[0.16em] text-gold">Schritt {i + 1}</p>
              <p className="mt-1 font-medium">{step.title}</p>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl">Testversand</h2>
        <p className="mt-1 text-sm text-muted">
          Prüft SPF/DKIM/DMARC und stellt einen Gmail-API-Job in die Warteschlange.
        </p>
        <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline sm:grid-cols-2">
          <Field label="Absender">
            <Select value={testFrom} onChange={(e) => setTestFrom(e.target.value)}>
              {activeSenders.map((i) => (
                <option key={i.id} value={i.address}>
                  {i.address}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zweck">
            <Input value={testPurpose} onChange={(e) => setTestPurpose(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button
              disabled={busy || !data.ready}
              variant={data.ready ? "gold" : "muted"}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await testMailSend({ data: { from: testFrom, purpose: testPurpose } });
                  toast.success(res.message);
                  await load();
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Blockiert");
                  await load();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {data.ready ? "Testfreigabe anfordern" : "Gesperrt — Authentifizierung fehlt"}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {data.log.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Versandversuche.</p>
          ) : (
            data.log.map((row) => (
              <div key={row.id} className="rounded-2xl bg-surface p-4 text-sm gold-hairline">
                <p className="font-medium">
                  {row.from_address} · {row.purpose}
                </p>
                <p className={`text-xs ${row.allowed ? "text-success" : "text-danger"}`}>
                  {row.allowed ? "freigegeben" : "abgelehnt"}
                  {row.reason ? ` — ${row.reason}` : ""}
                </p>
                <p className="text-xs text-muted">{deDateTime(row.created_at)}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ConnCard({ title, ok, hint }: { title: string; ok: boolean; hint: string }) {
  return (
    <div className="rounded-3xl bg-surface p-5 gold-hairline">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
      <p className={`mt-2 font-medium ${ok ? "text-success" : "text-warn"}`}>
        {ok ? "verbunden" : "vorbereitet"}
      </p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function IdentityRow({
  ident,
  busy,
  onToggle,
}: {
  ident: {
    id: string;
    address: string;
    display_name: string;
    kind: MailIdentityKind;
    mailbox_type: MailboxType;
    workspace_status: WorkspaceAccountStatus;
    purpose: string;
    active: boolean;
    required: boolean;
  };
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 gold-hairline">
      <div>
        <p className="font-medium">{ident.address}</p>
        <p className="text-xs text-muted">
          {ident.display_name} · {KIND_LABELS[ident.kind] ?? ident.kind} ·{" "}
          {MAILBOX_TYPE_LABELS[ident.mailbox_type] ?? ident.mailbox_type} · {ident.purpose}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gold">
          {WORKSPACE_STATUS_LABELS[ident.workspace_status] ?? ident.workspace_status}
        </span>
        <span className={`text-xs ${ident.active ? "text-success" : "text-muted"}`}>
          {ident.active ? "aktiv" : "deaktiviert"}
        </span>
        {!ident.required ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onToggle}>
            {ident.active ? "Sperren" : "Aktivieren"}
          </Button>
        ) : (
          <span className="text-xs text-muted">Pflicht</span>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  title,
  hint,
  state,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  state: AuthState;
  disabled: boolean;
  onChange: (s: AuthState) => void;
}) {
  return (
    <div className="rounded-3xl bg-surface p-5 gold-hairline">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
        <AuthChip state={state} />
      </div>
      <p className="mt-3 font-display text-3xl">{title}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      <Select
        className="mt-4"
        value={state}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AuthState)}
      >
        {AUTH_STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </div>
  );
}
