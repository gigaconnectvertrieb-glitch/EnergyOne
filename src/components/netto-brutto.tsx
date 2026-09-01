import { vatOn } from "@/lib/steuer";
import { eur } from "@/lib/utils";

export function NettoBrutto({
  net,
  size = "lg",
  gold = true,
}: {
  net: number;
  size?: "lg" | "md" | "sm";
  gold?: boolean;
}) {
  const v = vatOn(net);
  const big = size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-lg";
  return (
    <div>
      <p className={`font-display tabular-nums ${big} ${gold ? "text-gold" : ""}`}>{eur(v.net)}</p>
      <p className="text-sm text-muted">
        netto · + {eur(v.vat)} USt 19% = {eur(v.gross)} brutto
      </p>
    </div>
  );
}

export function vatLine(net: number) {
  const v = vatOn(net);
  return `${eur(v.net)} netto · ${eur(v.gross)} brutto`;
}
