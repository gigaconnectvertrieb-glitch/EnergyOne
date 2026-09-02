import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/auftraege/neu")({
  component: () => <Navigate to="/app/abschluss" />,
});
