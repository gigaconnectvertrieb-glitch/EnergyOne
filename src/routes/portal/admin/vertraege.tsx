import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createHvContract, downloadHvContract, listHvContracts, saveHvTabletSign, sendHvSignEmail } from "@/lib/server/hv-api";
import { SignaturePad } from "@/components/signature-pad";
import { listUsers } from "@/lib/server/api";
import { previewMusterVertrag } from "@/lib/server/sign-api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/admin/vertraege")({ component: Page });

function savePdf(filename: string, b64: string) {
  const a = document.createElement("a");
  a.href = `data:application/pdf;base64,${b64}`;
  a.download = filename;
  a.click();
}

function Page() {
  const [tab, setTab] = useState<"hv" | "kunde">("hv");
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Recht</p>
      <h1 className="mt-1 font-display text-4xl">Verträge</h1>
      <p className="mt-2 text-sm text-muted">
        Handelsvertreter: Name und Adresse eingeben, PDF erzeugen, dann Tablet oder DocuSign.
        Stufe 1, Provision, Vertragsstrafen, AGB. Vor dem ersten Einsatz Anwalt gegenlesen lassen.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant={tab === "hv" ? "default" : "outline"} onClick={() => setTab("hv")}>
          Handelsvertreter
        </Button>
        <Button variant={tab === "kunde" ? "default" : "outline"} onClick={() => setTab("kunde")}>
          Kunden-Muster
        </Button>
      </div>
      {tab === "hv" ? <HvPanel /> : <KundePanel />}
    </div>
  );
}

function HvPanel() {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [list, setList] = useState<Awaited<ReturnType<typeof listHvContracts>>>([]);
  const [padFor, setPadFor] = useState<string | null>(null);
  const [sign, setSign] = useState("");
  const [mailFor, setMailFor] = useState<string | null>(null);
  const [mail, setMail] = useState("");
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
    listHvContracts().then(setList).catch(() => setList([]));
  }
  useEffect(load, []);

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
      <form
        className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await createHvContract({
              data: { ...form, stufe: 1, userId: form.userId || undefined },
            });
            savePdf(res.filename, res.pdfBase64);
            toast.success("Vertrag erstellt · PDF gespeichert");
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erstellen fehlgeschlagen");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Automatisch erzeugen</p>
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
          <Input value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} />
        </Field>
        <div className="grid grid-cols-[1fr_5.5rem] gap-3">
          <Field label="Straße">
            <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} required />
          </Field>
          <Field label="Nr.">
            <Input value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value })} />
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
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="E-Mail">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gebiet / Stadt">
            <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </Field>
          <Field label="Beginn">
            <Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Steuer-ID / USt-IdNr.">
            <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </Field>
          <Field label="Gewerbe-Nr.">
            <Input value={form.tradeNo} onChange={(e) => setForm({ ...form, tradeNo: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Immer Stufe 1. Höherstufung nur Zusatzvereinbarung. Enthält Provisionsordnung, AGB,
          Datenschutz, Vertragsstrafen und Freistellung.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Erzeugt…" : "Vertrag als PDF erzeugen"}
        </Button>
      </form>

      <div className="mt-6 grid gap-2">
        {list.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface px-4 py-3 gold-hairline">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {r.first_name} {r.last_name}
                </p>
                <p className="text-xs text-muted">
                  {r.staff_id || "ohne ID"} · Stufe {r.stufe} · {r.city || "—"} ·{" "}
                  {r.signed_at ? `unterschrieben (${r.signed_channel === "tablet" ? "Tablet" : "DocuSign"})` : "noch offen"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  onClick={() => {
                    setPadFor(padFor === r.id ? null : r.id);
                    setMailFor(null);
                    setSign("");
                  }}
                >
                  Tablet
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
                  DocuSign
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
