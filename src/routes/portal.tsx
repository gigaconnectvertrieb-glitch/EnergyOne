import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/portal-shell";

export const Route = createFileRoute("/portal")({
  component: PortalShell,
});
