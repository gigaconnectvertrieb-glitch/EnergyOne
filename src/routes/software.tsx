import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/software")({
  component: () => <Navigate to="/portal" />,
});
