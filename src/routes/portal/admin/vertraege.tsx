import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  createHvContract,
  deleteHvContract,
  downloadHvContract,
  getHvContract,
  listHvContracts,
  pollHvSignatures,
  previewMusterHv,
  saveHvTabletSign,
  sendHvProvisionMail,
  sendHvSignEmail,
} from "@/lib/server/hv-api";
import { SignaturePad } from "@/components/signature-pad";
import { listUsers } from "@/lib/server/api";
import { previewMusterVertrag } from "@/lib/server/sign-api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { deDate } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/admin/vertraege")({
  validateSearch: (raw: Record<string, unknown>) => ({
    id: typeof raw.id === "string" ? raw.id : "",
  }),
  component: Page,
});

function pdfBlobUrl(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

function savePdf(filename: string, b64: string) {
  const url = pdfBlobUrl(b64);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Page() {
  const { id } = Route.useSearch();
  const [tab, setTab] = useState<"hv" | "kunde">("hv");
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Recht</p>
      <h1 className="mt-1 font-display text-4xl">HV-Verträge</h1>
      <p className="mt-2 text-sm text-muted">
        Jeder erzeugte Vertrag liegt in der Datenbank. Unten die gespeicherten Urkunden öffnen und lesen —
        nicht nur herunterladen. Mitarbeiter auswählen, Name und Adresse, dann erzeugen.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const file = await previewMusterHv();
              savePdf(file.filename, file.pdfBase64);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Muster fehlgeschlagen");
            }
          }}
        >
          Muster Handelsvertreter (PDF)
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const data = await previewMusterVertrag();
              savePdf("E1-Muster-Stromliefervertrag.pdf", data.pdfBase64);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Muster fehlgeschlagen");
            }
          }}
        >
          Muster Stromkunde (PDF)
        </Button>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant={tab === "hv" ? "default" : "outline"} onClick={() => setTab("hv")}>
          Handelsvertreter
        </Button>
        <Button variant={tab === "kunde" ? "default" : "outline"} onClick={() => setTab("kunde")}>
          Kunden-Muster
        </Button>
      </div>
      {tab === "hv" ? <HvPanel openId={id} /> : <KundePanel />}
    </div>
  );
}

function HvPanel({ openId }: { openId?: string }) {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [list, setList] = useState<Awaited<ReturnType<typeof listHvContracts>>>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [view, setView] = useState<Awaited<ReturnType<typeof getHvContract>> | null>(null);
  const [padFor, setPadFor] = useState<string | null>(null);
  const [sign, setSign] = useState("");
  const [mailFor, setMailFor] = useState<string | null>(null);
  const [mail, setMail] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    staffId: "",
    first: "",
    last: "",
    street: "",
    house: "",
    zip: "",
    city: "",
    email: "",
    phone: "",
    birth: "",
    taxId: "",
    tradeNo: "",
    region: "",
    start: "",
  });

  function load() {
    listUsers().then(setUsers).catch(() => setUsers([]));
    listHvContracts()
      .then((rows) => {
        setList(rows);
        setListErr(null);
      })
      .catch((e: unknown) => {
        setList([]);
        setListErr(e instanceof Error ? e.message : "Verträge nicht geladen");
      });
  }
  useEffect(load, []);
  useEffect(() => {
    if (!openId) return;
    getHvContract({ data: { id: openId } })
      .then(setView)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Vertrag nicht gefunden"));
  }, [openId]);

  async function openContract(id: string) {
    try {
      setView(await getHvContract({ data: { id } }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Vertrag nicht gefunden");
    }
  }

  function pick(userId: string) {
    const u = users.find((x) => x.user_id === userId);
    setForm((f) => ({
      ...f,
      userId,
      staffId: u?.staff_id || f.staffId,
      first: u?.first_name || f.first,
      last: u?.last_name || f.last,
      email: u?.email || f.email,
    }));
  }

  return (
    <>
      {view ? (
        <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Gespeichert in der Datenbank</p>
          <h2 className="mt-1 font-display text-3xl">
            {view.first_name} {view.last_name}
          </h2>
          <p className="text-sm text-muted">
            {view.staff_id || "ohne ID"} · Stufe {view.stufe} · {view.city || "—"} ·{" "}
            {view.signed_at ? "unterschrieben" : "noch nicht unterschrieben"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => savePdf(view.filename, view.pdfBase64)}
            >
              PDF herunterladen
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setView(null)}>
              Schließen
            </Button>
          </div>
          <pre className="mt-4 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-elevated p-4 text-xs leading-relaxed">
            {view.lines.join("\n")}
          </pre>
        </div>
      ) : null}

      <form
        className="mt-8 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await createHvContract({
              data: { ...form, stufe: 1, userId: form.userId || undefined },
            });
            toast.success("Vertrag in der Datenbank gespeichert");
            load();
            await openContract(res.id);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erstellen fehlgeschlagen");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Neuen HV-Vertrag anlegen</p>
        <Field label="Bestehenden Mitarbeiter übernehmen (optional)">
          <Select value={form.userId} onChange={(e) => pick(e.target.value)}>
            <option value="">Neu / manuell</option>
            {users.filter((u) => u.role !== "super_admin").map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {(u.staff_id || "ohne ID") + " · " + u.first_name + " " + u.last_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorname">
            <Input value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} required />
          </Field>
          <Field label="Nachname">
            <Input value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} required />
          </Field>
        </div>
        <Field label="Mitarbeiter-ID">
          <Input value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-[1fr_5.5rem] gap-3">
          <Field label="Straße">
            <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} required />
          </Field>
          <Field label="Nr.">
            <Input value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value })} required />
          </Field>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="PLZ">
            <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} required />
          </Field>
          <Field label="Ort">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telefon">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </Field>
          <Field label="E-Mail">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input className="flex-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <Button
                type="button"
                variant="outline"
                disabled={busy || !form.email.includes("@")}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await sendHvProvisionMail({
                      data: {
                        email: form.email,
                        first: form.first,
                        last: form.last,
                        staffId: form.staffId,
                        region: form.region,
                      },
                    });
                    toast.success(`Provisionsordnung an ${res.to}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Mail fehlgeschlagen");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Provisionen per Mail
              </Button>
            </div>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gebiet / Stadt">
            <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </Field>
          <Field label="Beginn">
            <Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Geburtsdatum">
            <Input value={form.birth} onChange={(e) => setForm({ ...form, birth: e.target.value })} required placeholder="TT.MM.JJJJ" />
          </Field>
          <Field label="Steuer-ID / USt-IdNr.">
            <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} required />
          </Field>
        </div>
        <Field label="Gewerbe-Nr.">
          <Input value={form.tradeNo} onChange={(e) => setForm({ ...form, tradeNo: e.target.value })} required />
        </Field>
        <p className="text-xs text-muted">
          Immer Stufe 1. Höherstufung nur Zusatzvereinbarung. Enthält Provisionsordnung, AGB,
          Datenschutz, Vertragsstrafen und Freistellung.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Speichert…" : "Vertrag speichern und anzeigen"}
        </Button>
      </form>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">Gespeicherte HV-Verträge</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const r = await pollHvSignatures();
              toast.success(`${r.completed} neu unterschrieben, ${r.checked} geprüft`);
              load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Prüfung fehlgeschlagen");
            }
          }}
        >
          Unterschriften prüfen
        </Button>
      </div>
      {listErr ? <p className="mt-2 text-sm text-danger">{listErr}</p> : null}
      {list.length === 0 && !listErr ? (
        <p className="mt-2 text-sm text-muted">Noch keiner. Oben anlegen — dann erscheint er hier und bleibt in der Datenbank.</p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {list.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface px-4 py-3 gold-hairline">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {r.first_name} {r.last_name}
                </p>
                <p className="text-xs text-muted">
                  {r.staff_id || "ohne ID"} · Stufe {r.stufe} · {r.city || "—"} · {deDate(r.created_at)} ·{" "}
                  {r.signed_by_company && r.signed_by_agent
                    ? "beide Seiten unterschrieben, PDF in der Datenbank"
                    : r.signed_at
                      ? `teilweise (${r.signed_channel === "tablet" ? "Tablet" : "DocuSign"})`
                      : "noch offen"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void openContract(r.id)}>
                  Lesen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const file = await downloadHvContract({ data: { id: r.id } });
                      savePdf(file.filename, file.pdfBase64);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
                    }
                  }}
                >
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await sendHvProvisionMail({ data: { id: r.id, email: r.email || form.email } });
                      toast.success(`Provisionen an ${res.to}`);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Mail fehlgeschlagen");
                    }
                  }}
                >
                  Provisionen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPadFor(padFor === r.id ? null : r.id);
                    setMailFor(null);
                    setSign("");
                  }}
                >
                  Tablet unterschreiben
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMailFor(mailFor === r.id ? null : r.id);
                    setPadFor(null);
                    setMail(r.email || "");
                  }}
                >
                  Per DocuSign an Vertreter
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-danger"
                  onClick={async () => {
                    if (!window.confirm(`${r.first_name} ${r.last_name} — Vertrag löschen?`)) return;
                    try {
                      await deleteHvContract({ data: { id: r.id } });
                      toast.success("Gelöscht");
                      if (padFor === r.id) setPadFor(null);
                      if (mailFor === r.id) setMailFor(null);
                      load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
                    }
                  }}
                >
                  Löschen
                </Button>
              </div>
            </div>
            {padFor === r.id ? (
              <div className="mt-3 grid gap-2">
                <SignaturePad value={sign} onChange={setSign} />
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await saveHvTabletSign({ data: { id: r.id, signatureData: sign } });
                      toast.success("Tablet-Unterschrift gespeichert");
                      setPadFor(null);
                      load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Unterschrift fehlgeschlagen");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Unterschrift speichern
                </Button>
              </div>
            ) : null}
            {mailFor === r.id ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  type="email"
                  placeholder="E-Mail des Handelsvertreters"
                  value={mail}
                  onChange={(e) => setMail(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await sendHvSignEmail({ data: { id: r.id, email: mail } });
                      toast.success(res.queued ? "In der Warteschlange (DocuSign-Keys setzen)" : "DocuSign raus");
                      setMailFor(null);
                      load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Versand fehlgeschlagen");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Senden
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

function KundePanel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof previewMusterVertrag>> | null>(null);
  useEffect(() => {
    previewMusterVertrag().then(setData).catch(() => setData(null));
  }, []);
  return (
    <>
      <Button
        className="mt-6"
        variant="outline"
        onClick={() => {
          if (!data) return;
          savePdf("E1-Mustervertrag-Strom.pdf", data.pdfBase64);
        }}
      >
        Kunden-Muster PDF
      </Button>
      <pre className="mt-6 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-3xl bg-surface p-5 text-xs leading-relaxed gold-hairline">
        {data?.lines.join("\n") || "Laden…"}
      </pre>
    </>
  );
}
