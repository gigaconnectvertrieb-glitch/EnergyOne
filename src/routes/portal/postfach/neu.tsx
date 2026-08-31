import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listMailboxes, sendMail } from "@/lib/server/mailbox-api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/postfach/neu")({
  validateSearch: (s: Record<string, unknown>) => ({
    mailbox: typeof s.mailbox === "string" ? s.mailbox : "",
  }),
  component: Page,
});

type Att = { filename: string; mime_type: string; content_base64: string };

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState<Awaited<ReturnType<typeof listMailboxes>>["boxes"]>([]);
  const [mailbox, setMailbox] = useState(search.mailbox);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listMailboxes().then((b) => {
      const sendable = b.boxes.filter((x) => x.can_send);
      setBoxes(sendable);
      setMailbox((cur) => cur || sendable[0]?.local || "");
    });
  }, []);

  async function files(list: FileList | null) {
    if (!list) return;
    const next: Att[] = [];
    for (const file of Array.from(list).slice(0, 6)) {
      if (file.size > 1_500_000) {
        toast.error(`${file.name} ist größer als 1,5 MB`);
        continue;
      }
      const content_base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = String(reader.result ?? "");
          resolve(r.includes(",") ? r.slice(r.indexOf(",") + 1) : r);
        };
        reader.onerror = () => reject(new Error("Datei unlesbar"));
        reader.readAsDataURL(file);
      });
      next.push({
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64,
      });
    }
    setAtts((cur) => [...cur, ...next].slice(0, 8));
  }

  async function submit(draft: boolean) {
    setBusy(true);
    try {
      const res = await sendMail({
        data: { mailbox, to, cc, subject, body, draft, attachments: atts },
      });
      toast.success(draft ? "Entwurf gespeichert" : "Gesendet");
      await navigate({ to: "/portal/postfach/$id", params: { id: res.thread_id } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Senden fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs uppercase tracking-[0.22em] text-gold">Neue Nachricht</p>
      <h1 className="mt-1 font-display text-4xl">Schreiben</h1>
      <p className="mt-2 text-sm text-muted">
        Persönlich immer erlaubt. info@, bewerbung@ und business@ nur mit Recht. Anhänge in beide
        Richtungen.
      </p>
      <div className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <Field label="Absender">
          <Select value={mailbox} onChange={(e) => setMailbox(e.target.value)}>
            {boxes.map((b) => (
              <option key={b.local} value={b.local}>
                {b.address}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="An">
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="kunde@…" required />
        </Field>
        <Field label="Kopie">
          <Input value={cc} onChange={(e) => setCc(e.target.value)} />
        </Field>
        <Field label="Betreff">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Nachricht">
          <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="Anhänge" hint="Bis 1,5 MB je Datei">
          <input
            type="file"
            multiple
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-2 file:text-bg"
            onChange={(e) => files(e.target.files)}
          />
          {atts.length ? (
            <ul className="mt-2 text-xs text-muted">
              {atts.map((a) => (
                <li key={a.filename}>{a.filename}</li>
              ))}
            </ul>
          ) : null}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !mailbox || !to} onClick={() => submit(false)}>
            Senden
          </Button>
          <Button variant="outline" disabled={busy || !mailbox} onClick={() => submit(true)}>
            Als Entwurf
          </Button>
        </div>
      </div>
    </div>
  );
}
