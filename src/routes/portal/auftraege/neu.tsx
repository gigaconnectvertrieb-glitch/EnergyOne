import { createFileRoute, Navigate } from "@tanstack/react-router";

// Vertragseingabe vorerst ausgeblendet – Daten und Backend bleiben erhalten.
export const Route = createFileRoute("/portal/auftraege/neu")({
  component: () => <Navigate to="/portal/auftraege" />,
});
