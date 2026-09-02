import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createRecruit } from "@/lib/server/recruiting-api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/app/bs")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [job, setJob] = useState("");
  const [note, setNote] = useState("");
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">BS</p>
      <h1 className="mt-1 font-display text-3xl">Bewerber</h1>
      <form
        className="mt-4 grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createRecruit({ data: { firstName: first, lastName: last, phone, email, job, note } });
            toast.success("In der Datenbank. Bestätigung per Mail wenn möglich.");
            nav({ to: "/app" });
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
        <Button type="submit">Speichern</Button>
      </form>
    </div>
  );
}
