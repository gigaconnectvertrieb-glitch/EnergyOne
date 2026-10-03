/**
 * E1 Auftragsdetail
 * -----------------
 * Status, New Sales, Unterschrift, Nachpflege.
 *
 * Ersetzt: src/routes/portal/auftraege/$id.tsx
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  changeStatus,
  getContract,
  noteNewsalesRef,
  pushNewsales,
  updateContractNotes,
  uploadContractFile,
} from "@/lib/server/api";
import {
  listSignEnvelopes,
  saveTabletSignature,
  sendSignEmail,
  downloadContractPdf,
} from "@/lib/server/sign-api";
import { SIGN_STATUS_LABELS, type SignStatus } from "@/lib/sign";
import { SignaturePad } from "@/components/signature-pad";
import {
  CANCEL_REASONS,
  STATUS_LABELS,
  TRANSITIONS,
  type ContractStatus,
} from "@/lib/e1";
import { deDate, deDateTime, eur } from "@/lib/utils";
import { NettoBrutto } from "@/components/netto-brutto";
import { vatOn } from "@/lib/steuer";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/portal/auftraege/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getContract>> | null>(null);
  const [nsRef, setNsRef] = useState("");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState("");
  const [meter, setMeter] = useState("");
  const [iban, setIban] = useState("");
  const [owner, setOwner] = useState("");
  const [signMail, setSignMail] = useState("");
  const [pad, setPad] = useState("");
  const [sign, setSign] = useState<Awaited<ReturnType<typeof listSignEnvelopes>> | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    getContract({ data: id })
      .then((d) => {
        setData(d);
        setNotes(d.contract.notes || "");
        setMeter(d.contract.meter_number || "");
        setIban(d.contract.bank_iban || "");
        setOwner(d.contract.bank_owner || "");
        setSignMail(d.contract.customer?.email || "");
        setNsRef(d.contract.newsales_ref || "");
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
    listSignEnvelopes({ data: { contractId: id } })
      .then(setSign)
      .catch(() => setSign(null));
  }

  useEffect(load, [id]);

  if (!data) {
    return <div className="mx-auto max-w-3xl h-40 animate-pulse rounded-3xl bg-surface" />;
  }

  const c = data.contract;
  const next = TRANSITIONS[c.status as ContractStatus] ?? [];
  const cust = c.customer;

  async function go(to: ContractStatus) {
    setBusy(true);
    try {
      await changeStatus({
        data: {
          id,
          to,
          comment,
          cancelReason: to === "storniert" ? reason : undefined,
        },
      });
      toast.success(`Status: ${STATUS_LABELS[to]}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nicht erlaubt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/portal/auftraege"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold"
      >
        <ChevronLeft className="size-4" />
        Aufträge
      </Link>

      <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-gold">
        {c.type === "strom" ? "Strom" : c.type === "gas" ? "Gas" : c.type}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl sm:text-4xl">
          {cust?.first_name} {cust?.last_name}
        </h1>
        <StatusBadge status={c.status as ContractStatus} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {c.product_name}
        {c.advisor_name ? ` · ${c.advisor_name}` : ""}
        {c.created_at ? ` · ${deDate(c.created_at)}` : ""}
      </p>

      {/* Stammdaten */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card title="Kunde">
          <p className="font-medium">
            {cust?.first_name} {cust?.last_name}
          </p>
          {cust?.phone && <p>{cust.phone}</p>}
          {cust?.email && <p>{cust.email}</p>}
          {cust?.street ? (
            <>
              <p>
                {cust.street} {cust.house_number}
              </p>
              <p>
                {cust.zip} {cust.city}
              </p>
            </>
          ) : (
            <p className="text-muted">Adresse ggf. in New Sales</p>
          )}
          {cust?.id && (
            <Link
              to="/portal/kunden/$id"
              params={{ id: cust.id }}
              className="mt-2 inline-block text-xs text-gold"
            >
              Kundenakte →
            </Link>
          )}
        </Card>

        <Card title="Vertrag">
          <p>
            {c.provider} · {c.product_name}
          </p>
          <p>Verbrauch {c.consumption_kwh ?? "—"} kWh</p>
          {c.meter_number && <p>Zähler {c.meter_number}</p>}
          {c.start_date && <p>Lieferbeginn {deDate(c.start_date)}</p>}
          {c.previous_provider && <p>Vorversorger {c.previous_provider}</p>}
        </Card>

        <Card title="Bank">
          {c.bank_iban ? (
            <>
              <p className="font-medium break-all">{c.bank_iban}</p>
              {c.bank_owner && <p>{c.bank_owner}</p>}
              <p className="text-xs text-muted">
                {c.sepa_confirmed ? "SEPA bestätigt" : "SEPA offen"}
              </p>
            </>
          ) : (
            <p className="text-muted">Keine IBAN hinterlegt</p>
          )}
        </Card>

        <Card title="Provision">
          <NettoBrutto net={c.advisor_commission ?? c.commission_amount ?? 0} />
          {(c.advisor_commission != null || c.commission_amount != null) && (
            <p className="mt-1 text-xs text-muted">
              brutto{" "}
              {eur(
                vatOn(Number(c.advisor_commission ?? c.commission_amount ?? 0)).gross,
              )}
            </p>
          )}
        </Card>
      </div>

      {/* Status wechseln */}
      {next.length > 0 && (
        <section className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Status ändern</p>
          <Field label="Kommentar" className="mt-3">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          {next.includes("storniert") && (
            <Field label="Storno-Grund" className="mt-2">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">— wählen —</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {next.map((to) => (
              <Button
                key={to}
                type="button"
                variant={to === "storniert" ? "outline" : "default"}
                disabled={busy || (to === "storniert" && !reason)}
                onClick={() => void go(to)}
              >
                → {STATUS_LABELS[to]}
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* New Sales */}
      <section className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">New Sales</p>
        <Field label="Vorgangsnummer New Sales" className="mt-3">
          <Input
            value={nsRef}
            onChange={(e) => setNsRef(e.target.value)}
            placeholder="optional"
          />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await noteNewsalesRef({ data: { id, ref: nsRef } });
                toast.success("Referenz gespeichert");
                load();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Fehler");
              } finally {
                setBusy(false);
              }
            }}
          >
            Ref speichern
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await pushNewsales({ data: { id } });
                toast.success("An New Sales übergeben");
                load();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Übergabe fehlgeschlagen");
              } finally {
                setBusy(false);
              }
            }}
          >
            An New Sales senden
          </Button>
        </div>
        {c.newsales_ref && (
          <p className="mt-2 text-xs text-muted">Aktuell: {c.newsales_ref}</p>
        )}
      </section>

      {/* Unterschrift */}
      <section className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Unterschrift</p>
        <Field label="E-Mail für DocuSign" className="mt-3">
          <Input
            type="email"
            value={signMail}
            onChange={(e) => setSignMail(e.target.value)}
          />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !signMail}
            onClick={async () => {
              setBusy(true);
              try {
                await sendSignEmail({ data: { contractId: id, email: signMail } });
                toast.success("Signatur-Mail gesendet");
                load();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Versand fehlgeschlagen");
              } finally {
                setBusy(false);
              }
            }}
          >
            Per E-Mail senden
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                const file = await downloadContractPdf({ data: { id } });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(
                  new Blob([file.pdf || file], { type: "application/pdf" }),
                );
                a.download = file.filename || `vertrag-${id}.pdf`;
                a.click();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "PDF fehlgeschlagen");
              }
            }}
          >
            PDF laden
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted">Oder vor Ort am Tablet</p>
        <SignaturePad value={pad} onChange={setPad} />
        <Button
          type="button"
          className="mt-2"
          disabled={busy || !pad}
          onClick={async () => {
            setBusy(true);
            try {
              await saveTabletSignature({ data: { contractId: id, dataUrl: pad } });
              toast.success("Unterschrift gespeichert");
              setPad("");
              load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Fehler");
            } finally {
              setBusy(false);
            }
          }}
        >
          Unterschrift speichern
        </Button>
        {sign && sign.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {sign.map((s) => (
              <li key={s.id}>
                {SIGN_STATUS_LABELS[s.status as SignStatus] || s.status}
                {s.sent_at ? ` · ${deDateTime(s.sent_at)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Nachpflege */}
      <section className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Nachpflege</p>
        <Field label="Notizen" className="mt-3">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Field label="Zähler">
            <Input value={meter} onChange={(e) => setMeter(e.target.value)} />
          </Field>
          <Field label="IBAN">
            <Input value={iban} onChange={(e) => setIban(e.target.value)} />
          </Field>
          <Field label="Kontoinhaber">
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </Field>
        </div>
        <Field label="Datei anhängen" className="mt-2">
          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  await uploadContractFile({
                    data: {
                      id,
                      base64: String(reader.result || ""),
                      filename: f.name,
                    },
                  });
                  toast.success("Datei im Auftrag");
                  load();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Upload fehlgeschlagen",
                  );
                }
              };
              reader.readAsDataURL(f);
            }}
          />
        </Field>
        <Button
          className="mt-3"
          variant="outline"
          onClick={async () => {
            try {
              await updateContractNotes({
                data: {
                  id,
                  notes,
                  meterNumber: meter,
                  iban,
                  bankOwner: owner,
                },
              });
              toast.success("Gespeichert");
              load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Fehler");
            }
          }}
        >
          Speichern
        </Button>
      </section>

      {/* Verlauf */}
      <section className="mt-6">
        <p className="text-sm font-medium">Verlauf</p>
        <ol className="mt-2 space-y-2">
          {(data.history || []).map((h) => (
            <li key={h.id} className="text-sm">
              <span className="text-gold">{deDateTime(h.changed_at)}</span>{" "}
              {h.old_status
                ? STATUS_LABELS[h.old_status as ContractStatus]
                : "–"}{" "}
              → {STATUS_LABELS[h.new_status as ContractStatus]}
              {h.by ? ` · ${h.by}` : ""}
              {h.comment ? (
                <span className="text-muted"> – {h.comment}</span>
              ) : null}
            </li>
          ))}
          {(!data.history || data.history.length === 0) && (
            <li className="text-sm text-muted">Noch kein Verlauf</li>
          )}
        </ol>
      </section>

      {/* Dokumente */}
      {data.documents && data.documents.length > 0 && (
        <section className="mt-6">
          <p className="text-sm font-medium">Dokumente</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {data.documents.map((doc) =>
              doc.file_path?.startsWith("data:image") ? (
                <figure
                  key={doc.id}
                  className="rounded-2xl bg-surface p-3 gold-hairline"
                >
                  <img
                    src={doc.file_path}
                    alt={doc.type}
                    className="max-h-48 w-full object-contain"
                  />
                  <figcaption className="mt-2 text-xs text-muted">{doc.type}</figcaption>
                </figure>
              ) : (
                <p key={doc.id} className="text-sm text-muted">
                  {doc.type}
                </p>
              ),
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-surface p-5 text-sm gold-hairline">
      <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
