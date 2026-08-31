import { AUTH_STATE_LABELS, AUTH_STATE_TONE, type AuthState } from "@/lib/mail";
import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  success:
    "text-success bg-success/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-success)_35%,transparent)]",
  warn: "text-warn bg-warn/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-warn)_35%,transparent)]",
  danger:
    "text-danger bg-danger/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_35%,transparent)]",
};

export function AuthChip({ state, className }: { state: AuthState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        tone[AUTH_STATE_TONE[state]],
        className,
      )}
    >
      {AUTH_STATE_LABELS[state]}
    </span>
  );
}
