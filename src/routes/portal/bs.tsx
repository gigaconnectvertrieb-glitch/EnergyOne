import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createRecruit, listRecruits, setRecruitStatus } from "@/lib/server/recruiting-api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/bs")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listRecruits>>>([]);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [job, setJob] = useState("");
  const [note, setNote] = useState("");
  function load() {
    listRecruits().then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Team</p>
      <h1 className="mt-1 font-display text-4xl">BS · Bewerber</h1>
      <p className="mt-2 text-sm text-muted">Leute, die potenziell für uns arbeiten. Bestätigung geht an die E-Mail, wenn App-Passwort in Render steht.</p>
      <form
        className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline md:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createRecruit({ data: { firstName: first, lastName: last, phone, email, job, note } });
            toast.success("Gespeichert");
            setFirst("");
            setLast("");
            setPhone("");
            setEmail("");
            setJob("");
            setNote("");
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Nicht gespeichert");
          }
        }}
      >
        <Field label="Vorname">
          <Input value={first} onChange={(e) => setFirst(e.target.value)} required />
        </Field>
        <Field label="Nachname">
          <Input value={last} onChange={(e) => setLast(e.target.value)} required />
        </Field>
        <Field label="Telefon">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="E-Mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Aktueller Beruf">
          <Input value={job} onChange={(e) => setJob(e.target.value)} />
        </Field>
        <Field label="Kurzinfo">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit">Bewerber speichern</Button>
        </div>
      </form>
      <div className="mt-6 grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="font-medium">
              {r.first_name} {r.last_name}
            </p>
            <p className="text-sm text-muted">
              {r.job || "Beruf offen"} · {r.phone} · {r.email}
            </p>
            {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
            <p className="mt-1 text-xs text-muted">von {r.by || "—"}</p>
            <Select
              className="mt-2 max-w-xs"
              value={r.status}
              onChange={async (e) => {
                await setRecruitStatus({ data: { id: r.id, status: e.target.value } });
                load();
              }}
            >
              <option value="neu">Neu</option>
              <option value="kontakt">Kontaktiert</option>
              <option value="gespraech">Gespräch</option>
              <option value="zusage">Zusage</option>
              <option value="absage">Absage</option>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
