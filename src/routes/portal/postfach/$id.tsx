import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  archiveThread,
  forwardMail,
  getMailAttachment,
  getThread,
  markThreadRead,
  replyMail,
} from "@/lib/server/mailbox-api";
import { MatchChip } from "@/components/mailbox";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { deDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";

export const Route = createFileRoute("/portal/postfach/$id")({ component: Page });

type Att = { filename: string; mime_type: string; content_base64: string };

function Page() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getThread>> | null>(null);
  const [reply, setReply] = useState("");
  const [fwdTo, setFwdTo] = useState("");
  const [fwdNote, setFwdNote] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const next = await getThread({ data: id });
    setData(next);
    if (next.thread.unread_count) {
      await markThreadRead({ data: { id, unread: false } });
    }
  }

  useEffect(() => {
    load().catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }, [id]);

  async function files(list: FileList | null) {
    if (!list) return;
    const next: Att[] = [];
    for (const file of Array.from(list).slice(0, 4)) {
      const content_base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = String(reader.result ?? "");
          resolve(r.includes(",") ? r.slice(r.indexOf(",") + 1) : r);
        };
        reader.readAsDataURL(file);
      });
      next.push({
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64,
      });
    }
    setAtts(next);
  }

  async function download(attId: string) {
    try {
      const file = await getMailAttachment({ data: attId });
      const a = document.createElement("a");
      a.href = `data:${file.mime_type};base64,${file.content_base64}`;
      a.download = file.filename;
      a.click();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Anhang fehlt");
    }
  }

  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-surface" />;
  const t = data.thread;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/portal/postfach" className="text-sm text-muted hover:text-gold">
        Zurück zum Postfach
      </Link>
      <h1 className="mt-3 font-display text-4xl">{t.subject}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MatchChip
          customerId={t.customer_id}
          contractId={t.contract_id}
          leadId={t.lead_id}
          applicationId={t.application_id}
          reason={t.match_reason}
        />
        {t.customer ? (
          <span className="text-xs text-muted">zugeordnet: {t.customer.name}</span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await archiveThread({ data: id });
            toast.success("Archiviert");
          }}
        >
          Archivieren
        </Button>
      </div>

      <div className="mt-6 grid gap-3">
        {data.messages.map((m) => (
          <article key={m.id} className="rounded-3xl bg-surface p-5 gold-hairline">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {m.from_name || m.from_address}
                  <span className="ml-2 text-xs font-normal text-muted">{m.from_address}</span>
                </p>
                <p className="text-xs text-muted">An {m.to_addresses}</p>
              </div>
              <p className="text-xs text-muted tabular-nums">{deDateTime(m.sent_at)}</p>
            </div>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
              {m.body_text}
            </pre>
            {m.attachments.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-elevated px-3 text-sm"
                    onClick={() => download(a.id)}
                  >
                    <Paperclip className="size-4 text-gold" />
                    {a.filename}
                  </button>
                ))}
              </div>
            ) : null}
            {m.draft ? <p className="mt-3 text-xs text-warn">Entwurf</p> : null}
            {m.status === "queued" ? (
              <p className="mt-3 text-xs text-muted">In der Gmail-Warteschlange</p>
            ) : null}
          </article>
        ))}
      </div>

      {data.can_send ? (
        <div className="mt-8 grid gap-6">
          <form
            className="rounded-3xl bg-surface p-5 gold-hairline"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              setBusy(true);
              try {
                await replyMail({ data: { threadId: id, body: reply, attachments: atts } });
                setReply("");
                setAtts([]);
                toast.success("Antwort gesendet");
                await load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Fehler");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="font-display text-2xl">Antworten</h2>
            <Textarea
              className="mt-3"
              rows={6}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              required
            />
            <input
              type="file"
              multiple
              className="mt-3 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-2 file:text-bg"
              onChange={(e) => files(e.target.files)}
            />
            <Button className="mt-3" type="submit" disabled={busy || !reply.trim()}>
              Antwort senden
            </Button>
          </form>

          <form
            className="rounded-3xl bg-surface p-5 gold-hairline"
            onSubmit={async (e) => {
              e.preventDefault();
              const last = data.messages[data.messages.length - 1];
              if (!last || !fwdTo.trim()) return;
              setBusy(true);
              try {
                await forwardMail({ data: { messageId: last.id, to: fwdTo, note: fwdNote } });
                toast.success("Weitergeleitet");
                setFwdTo("");
                setFwdNote("");
                await load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Fehler");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="font-display text-2xl">Weiterleiten</h2>
            <div className="mt-3 grid gap-3">
              <Field label="An">
                <Input value={fwdTo} onChange={(e) => setFwdTo(e.target.value)} required />
              </Field>
              <Field label="Notiz">
                <Textarea rows={3} value={fwdNote} onChange={(e) => setFwdNote(e.target.value)} />
              </Field>
            </div>
            <Button className="mt-3" type="submit" disabled={busy || !fwdTo.trim()}>
              Weiterleiten
            </Button>
          </form>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Nur Lesen in diesem Postfach.</p>
      )}
    </div>
  );
}
