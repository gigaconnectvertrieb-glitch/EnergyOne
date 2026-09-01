import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/planung")({
  component: () => <Navigate to="/portal/gebiete" />,
});
