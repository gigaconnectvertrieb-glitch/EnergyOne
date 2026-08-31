import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Offizieller Einzelblitz mit E1. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/emblem.png"
      alt="E1"
      className={cn("object-contain object-center", className)}
    />
  );
}

/** Header: Blitz + E1 (Gold) DIREKTVERTRIEB (Weiß). */
export function Wordmark({
  to = "/",
  compact = false,
  className,
}: {
  to?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link to={to} className={cn("flex items-center gap-2.5 min-h-11", className)}>
      <img
        src="/emblem.png"
        alt=""
        className={cn("shrink-0 object-contain", compact ? "h-10 w-auto" : "h-12 w-auto md:h-14")}
      />
      <span className="flex items-center gap-1.5 leading-none whitespace-nowrap">
        <span
          className={cn(
            "font-display font-semibold text-gold",
            compact ? "text-xl" : "text-2xl md:text-[1.65rem]",
          )}
        >
          E1
        </span>
        <span
          className={cn(
            "font-semibold uppercase text-ink",
            compact ? "text-[10px] tracking-[0.16em]" : "text-[11px] tracking-[0.18em] md:text-xs",
          )}
        >
          Direktvertrieb
        </span>
      </span>
    </Link>
  );
}

/** Gesamtes Logo mit Schriftzug und Slogan. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <img
      src="/logo-full.jpg"
      alt="E1 Direktvertrieb – Energie, die zu Ihnen passt."
      className={cn("object-contain", className)}
    />
  );
}
