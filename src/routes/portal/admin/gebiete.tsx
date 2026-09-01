import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/gebiete")({
  component: () => <Navigate to="/portal/planung" />,
});
