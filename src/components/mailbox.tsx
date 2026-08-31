import { Link } from "@tanstack/react-router";
import { MAIL_FOLDER_LABELS, mailboxLabel, type MailFolder } from "@/lib/mailbox";
import { cn } from "@/lib/utils";

export function FolderTabs({
  value,
  onChange,
  counts,
}: {
  value: MailFolder;
  onChange: (f: MailFolder) => void;
  counts?: Partial<Record<MailFolder, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(MAIL_FOLDER_LABELS) as MailFolder[]).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={cn(
            "min-h-11 rounded-full px-4 text-sm gold-hairline",
            value === f ? "bg-gold text-bg" : "bg-surface text-muted hover:text-ink",
          )}
        >
          {MAIL_FOLDER_LABELS[f]}
          {counts?.[f] ? <span className="ml-1 tabular-nums">{counts[f]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function MatchChip({
  customerId,
  contractId,
  leadId,
  applicationId,
  reason,
  link = true,
}: {
  customerId?: string | null;
  contractId?: string | null;
  leadId?: string | null;
  applicationId?: string | null;
  reason?: string | null;
  link?: boolean;
}) {
  if (!customerId && !contractId && !leadId && !applicationId) return null;
  const label = contractId
    ? `Auftrag ${contractId.slice(0, 8)}`
    : customerId
      ? "Kunde"
      : leadId
        ? "Lead"
        : "Bewerbung";
  const text = reason ? `${label} · ${reason}` : label;
  const className = "inline-flex min-h-8 items-center rounded-full bg-gold/10 px-2.5 text-xs text-gold";
  if (!link) return <span className={className}>{text}</span>;
  const to = customerId
    ? { to: "/portal/kunden/$id" as const, params: { id: customerId } }
    : contractId
      ? { to: "/portal/auftraege/$id" as const, params: { id: contractId } }
      : leadId
        ? { to: "/portal/admin/leads" as const }
        : { to: "/portal/admin/onboarding" as const };
  return (
    <Link {...to} className={className}>
      {text}
    </Link>
  );
}

export function MailboxSwitch({
  boxes,
  value,
  onChange,
}: {
  boxes: Array<{ local: string; address: string; label: string; kind: string }>;
  value: string;
  onChange: (local: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {boxes.map((b) => (
        <button
          key={b.local}
          type="button"
          onClick={() => onChange(b.local)}
          className={cn(
            "shrink-0 min-h-11 rounded-full px-4 text-sm",
            value === b.local ? "bg-gold text-bg" : "bg-elevated text-muted",
          )}
        >
          {mailboxLabel(b.local)}
        </button>
      ))}
    </div>
  );
}

export function UnreadDot({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] font-medium text-bg tabular-nums">
      {n > 99 ? "99+" : n}
    </span>
  );
}
