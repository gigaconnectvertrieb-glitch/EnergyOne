import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { changeStatus, getContract, updateContractNotes } from "@/lib/server/api";
import { listSignEnvelopes, saveTabletSignature, sendSignEmail, downloadContractPdf } from "@/lib/server/sign-api";
import { SIGN_STATUS_LABELS, type SignStatus } from "@/lib/sign";
import { SignaturePad } from "@/components/signature-pad";
import { CANCEL_REASONS, STATUS_LABELS, TRANSITIONS, type ContractStatus } from "@/lib/e1";
import { deDate, deDateTime, eur } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/auftraege/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getContract>> | null>(null);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState("");
  const [meter, setMeter] = useState("");
  const [signMail, setSignMail] = useState("");
  const [pad, setPad] = useState("");
  const [sign, setSign] = useState<Awaited<ReturnType<typeof listSignEnvelopes>> | null>(null);

  function load() {
    getContract({ data: id })
      .then((d) => {
        setData(d);
        setNotes(d.contract.notes);
        setMeter(d.contract.meter_number);
        setSignMail(d.contract.customer.email || "");
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
    listSignEnvelopes({ data: { contractId: id } })
      .then(setSign)
      .catch(() => setSign(null));
  }
  useEffect(load, [id]);
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  const c = data.contract;
  const next = TRANSITIONS[c.status] ?? [];

  async function go(to: ContractStatus) {
    try {
      await changeStatus({
        data: { id, to, comment, cancelReason: to === "storniert" ? reason : undefined },
      });
      toast.success(`Status: ${STATUS_LABELS[to]}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nicht erlaubt");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">{c.type === "strom" ? "Strom" : "Gas"}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl">
          {c.customer.first_name} {c.customer.last_name}
        </h1>
        <StatusBadge status={c.status} />
      </div>
      <p className="text-sm text-muted">
        {c.product_name} · Berater {c.advisor_name} · {deDate(c.created_at)}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card title="Kunde">
          <p className="font-medium">
            {c.customer.first_name} {c.customer.last_name}
          </p>
          {c.customer.phone ? <p>{c.customer.phone}</p> : null}
          {c.customer.email ? <p>{c.customer.email}</p> : null}
          {c.customer.street ? (
            <>
              <p>
                {c.customer.street} {c.customer.house_number}
              </p>
              <p>
                {c.customer.zip} {c.customer.city}
              </p>
            </>
          ) : (
            <p className="text-muted">Adresse liegt in New Sales</p>
          )}
        </Card>
        <Card title="Vertrag">
          <p>
            {c.provider} · {c.product_name}
            {c.tariff_external_id ? ` · ID ${c.tariff_external_id}` : ""}
          </p>
          <p>Verbrauch {c.consumption_kwh} kWh</p>
          {c.meter_number ? <p>Zähler {c.meter_number}</p> : null}
          {c.start_date ? <p>Lieferbeginn {deDate(c.start_date)}</p> : null}
        </Card>
        <Card title="Provision">
          <p className="font-display text-2xl">{eur(c.advisor_amount ?? c.commission_amount)}</p>
          <p className="text-sm text-muted">Berater Stufe {c.commission_stufe || 1}</p>
          {c.show_split ? (
            <>
              <p className="mt-2 text-sm">Agentur (NS 13) {eur(c.agency_amount ?? c.commission_amount)}</p>
              <p className="text-sm text-gold">E1-Marge {eur(c.margin_amount ?? 0)}</p>
            </>
          ) : null}
          {data.commissions.map((x) => (
            <p key={x.id} className="text-xs text-muted">
              {x.type} · {eur(x.amount)} · {x.status}
            </p>
          ))}
        </Card>
      </div>

      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <h2 className="text-sm font-medium">New Sales</h2>
        <p className="mt-1 text-sm text-muted">
          Der Vertrag liegt bei New Sales. Hier nur Name, Adresse, Telefon, Tarif — damit die
          E1-Datenbank voll ist. Teamleiter gleichen in New Sales ab.
        </p>
        {c.newsales_ref ? <p className="mt-3 text-sm">Vorgang {c.newsales_ref}</p> : null}
      </div>

      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <h2 className="text-sm font-medium">Unterschrift</h2>
        <p className="mt-1 text-sm text-muted">
          {c.signature_confirmed
            ? "Vertrag ist unterschrieben und liegt im Auftrag."
            : "Vor Ort auf dem Tablet, oder per E-Mail rausschicken. Sobald der Kunde signiert, kommt das PDF automatisch hier rein."}
        </p>
        {sign?.envelopes.length ? (
          <ul className="mt-3 grid gap-1 text-sm">
            {sign.envelopes.map((e) => (
              <li key={e.id}>
                {e.channel === "tablet" ? "Tablet" : "E-Mail"} ·{" "}
                {SIGN_STATUS_LABELS[e.status as SignStatus] || e.status}
                {e.recipient_email ? ` · ${e.recipient_email}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {sign?.files.length ? (
          <p className="mt-2 text-xs text-muted">
            Dateien: {sign.files.map((f) => f.filename).join(", ")}
          </p>
        ) : null}
        <Field label="Kunden-E-Mail">
          <Input value={signMail} onChange={(e) => setSignMail(e.target.value)} placeholder="kunde@…" />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const file = await downloadContractPdf({ data: { contractId: id } });
                const a = document.createElement("a");
                a.href = `data:application/pdf;base64,${file.base64}`;
                a.download = file.filename;
                a.click();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "PDF fehlgeschlagen");
              }
            }}
          >
            Vertrag als PDF
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const r = await sendSignEmail({ data: { contractId: id, email: signMail } });
                toast.success(r.queued ? "Vorgemerkt — DocuSign-Keys in Render setzen" : "An den Kunden gesendet");
                load();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Versand fehlgeschlagen");
              }
            }}
          >
            Per E-Mail zur Unterschrift
          </Button>
        </div>
        <p className="mt-5 text-xs uppercase tracking-[0.2em] text-gold">Vor Ort · Tablet</p>
        <div className="mt-2">
          <SignaturePad value={pad} onChange={setPad} />
        </div>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await saveTabletSignature({ data: { contractId: id, image: pad } });
              toast.success("Unterschrift gespeichert");
              load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Pad leer?");
            }
          }}
        >
          Tablet-Unterschrift speichern
        </Button>
      </div>

      {next.length ? (
        <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
          <h2 className="text-sm font-medium">Status ändern</h2>
          {next.includes("storniert") ? (
            <Field label="Stornogrund">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Bitte wählen</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Kommentar">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {next.map((s) => (
              <Button
                key={s}
                variant={s === "storniert" ? "danger" : "outline"}
                size="sm"
                onClick={() => void go(s)}
              >
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <h2 className="text-sm font-medium">Korrektur</h2>
        <Field label="Zählernummer">
          <Input value={meter} onChange={(e) => setMeter(e.target.value)} />
        </Field>
        <Field label="Notizen">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button
          className="mt-3"
          variant="outline"
          size="sm"
          onClick={async () => {
            await updateContractNotes({ data: { id, notes, meterNumber: meter } });
            toast.success("Gespeichert");
            load();
          }}
        >
          Speichern
        </Button>
      </div>

      <h2 className="mt-8 font-display text-2xl">Verlauf</h2>
      <ol className="mt-3 space-y-2">
        {data.history.map((h) => (
          <li key={h.id} className="text-sm">
            <span className="text-gold">{deDateTime(h.changed_at)}</span>{" "}
            {h.old_status ? STATUS_LABELS[h.old_status as ContractStatus] : "–"} →{" "}
            {STATUS_LABELS[h.new_status as ContractStatus]} · {h.by}
            {h.comment ? <span className="text-muted"> – {h.comment}</span> : null}
          </li>
        ))}
      </ol>

      {data.documents.length ? (
        <>
          <h2 className="mt-8 font-display text-2xl">Dokumente</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.documents.map((doc) =>
              doc.file_path.startsWith("data:image") ? (
                <figure key={doc.id} className="rounded-2xl bg-surface p-3 gold-hairline">
                  <img src={doc.file_path} alt={doc.type} className="max-h-48 w-full object-contain" />
                  <figcaption className="mt-2 text-xs text-muted">{doc.type}</figcaption>
                </figure>
              ) : (
                <p key={doc.id} className="text-sm text-muted">
                  {doc.type}
                </p>
              ),
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-surface p-5 text-sm gold-hairline">
      <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
      {children}
    </div>
  );
}
