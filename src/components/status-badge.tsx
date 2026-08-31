import { STATUS_LABELS, STATUS_TONE, type ContractStatus } from "@/lib/e1";
import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  gold: "text-gold bg-gold/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gold)_35%,transparent)]",
  warn: "text-warn bg-warn/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-warn)_35%,transparent)]",
  info: "text-info bg-info/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-info)_35%,transparent)]",
  success:
    "text-success bg-success/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-success)_35%,transparent)]",
  danger:
    "text-danger bg-danger/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_35%,transparent)]",
  muted: "text-muted bg-elevated shadow-[0_0_0_1px_var(--color-line)]",
};

export function StatusBadge({ status, className }: { status: ContractStatus | string; className?: string }) {
  const label = STATUS_LABELS[status as ContractStatus] ?? status;
  const t = STATUS_TONE[status as ContractStatus] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        tone[t],
        className,
      )}
    >
      {label}
    </span>
  );
}
