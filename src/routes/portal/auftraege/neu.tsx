import { createFileRoute } from "@tanstack/react-router";
import { ContractCapture } from "@/components/contract-capture";

export const Route = createFileRoute("/portal/auftraege/neu")({
  validateSearch: (raw: Record<string, unknown>) => {
    const s = (k: string) => (typeof raw[k] === "string" && raw[k] ? String(raw[k]) : undefined);
    return {
      street: s("street"),
      house: s("house"),
      zip: s("zip"),
      city: s("city"),
    };
  },
  component: Page,
});

function Page() {
  return <ContractCapture afterTo="portal" pre={Route.useSearch()} />;
}
