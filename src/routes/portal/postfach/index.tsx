import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { deleteThread, listMailboxes, listThreads, syncMailbox } from "@/lib/server/mailbox-api";
import { FolderTabs, MailboxSwitch, MatchChip } from "@/components/mailbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { deDateTime } from "@/lib/utils";
import { toast } from "sonner";
import type { MailFolder } from "@/lib/mailbox";
import { Paperclip, PenLine, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/portal/postfach/")({ component: Page });

function Page() {
  const [boxes, setBoxes] = useState<Awaited<ReturnType<typeof listMailboxes>> | null>(null);
  const [mailbox, setMailbox] = useState("");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof listThreads>> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listMailboxes()
      .then((b) => {
        setBoxes(b);
        setMailbox((cur) => cur || b.boxes[0]?.local || "");
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Kein Postfach"));
  }, []);

  useEffect(() => {
    if (!mailbox) return;
    const t = window.setTimeout(() => {
      listThreads({ data: { mailbox, folder, q } })
        .then(setData)
        .catch(() => setData({ mailbox, folder, can_send: false, threads: [] }));
    }, 180);
    return () => window.clearTimeout(t);
  }, [mailbox, folder, q]);

  const counts = useMemo(() => {
    const map: Partial<Record<MailFolder, number>> = {};
    for (const c of boxes?.counts ?? []) {
      if (c.mailbox !== mailbox) continue;
      map[c.folder as MailFolder] = c.n;
    }
    return map;
  }, [boxes, mailbox]);

  if (!boxes) return <div className="h-48 animate-pulse rounded-3xl bg-surface" />;

  if (!boxes.boxes.length) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl bg-surface p-8 gold-hairline">
        <h1 className="font-display text-4xl">Postfach</h1>
        <p className="mt-3 text-sm text-muted">
          Ihr Workspace-Konto wird angelegt, sobald ein Super-Admin Sie freischaltet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-gold">Google Workspace</p>
          <h1 className="mt-1 font-display text-4xl">Postfach</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Die Postfächer liegen in Workspace. Render spricht nur mit der Gmail API und ordnet
            Nachrichten Kunde und Auftrag zu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !mailbox}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await syncMailbox({ data: { mailbox } });
                toast.success(
                  res.source === "gmail"
                    ? `${res.synced} neue Nachrichten von Gmail`
                    : "Lokaler Posteingang — Gmail-Sync sobald der Service-Account steht",
                );
                const next = await listThreads({ data: { mailbox, folder, q } });
                setData(next);
                setBoxes(await listMailboxes());
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Sync fehlgeschlagen");
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw className="size-4" />
            Sync
          </Button>
          <Link to="/portal/postfach/neu" search={{ mailbox }}>
            <Button disabled={!data?.can_send && mailbox !== boxes.boxes.find((b) => b.kind === "personal")?.local}>
              <PenLine className="size-4" />
              Schreiben
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <MailboxSwitch boxes={boxes.boxes} value={mailbox} onChange={setMailbox} />
      </div>
      <div className="mt-4">
        <FolderTabs value={folder} onChange={setFolder} counts={counts} />
      </div>
      <Input
        className="mt-4 max-w-md"
        placeholder="Suchen in Betreff und Text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="mt-4 grid gap-2">
        {!data ? (
          <div className="h-32 animate-pulse rounded-3xl bg-surface" />
        ) : data.threads.length === 0 ? (
          <p className="rounded-3xl bg-surface p-8 text-sm text-muted gold-hairline">
            Keine Nachrichten in diesem Ordner.
          </p>
        ) : (
          data.threads.map((t) => (
            <div key={t.id} className="flex items-stretch gap-2">
            <Link
              to="/portal/postfach/$id"
              params={{ id: t.id }}
              className="min-w-0 flex-1 rounded-2xl bg-surface p-4 gold-hairline"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className={`pr-4 ${t.unread_count ? "font-medium text-ink" : "text-ink"}`}>{t.subject}</p>
                <p className="shrink-0 text-xs text-muted tabular-nums">{deDateTime(t.last_at)}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{t.snippet}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.unread_count ? (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-medium text-bg">
                    {t.unread_count} neu
                  </span>
                ) : null}
                {t.attachments ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted">
                    <Paperclip className="size-3" /> {t.attachments}
                  </span>
                ) : null}
                <MatchChip
                  customerId={t.customer_id}
                  contractId={t.contract_id}
                  leadId={t.lead_id}
                  applicationId={t.application_id}
                  reason={t.match_reason}
                  link={false}
                />
              </div>
            </Link>
            <button
              type="button"
              className="grid w-11 shrink-0 place-items-center rounded-2xl gold-hairline text-danger"
              aria-label="Löschen"
              onClick={async (e) => {
                e.preventDefault();
                if (!window.confirm("Diese Mail löschen?")) return;
                try {
                  await deleteThread({ data: t.id });
                  toast.success("Gelöscht");
                  setData(await listThreads({ data: { mailbox, folder, q } }));
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
                }
              }}
            >
              <Trash2 className="size-4" />
            </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
