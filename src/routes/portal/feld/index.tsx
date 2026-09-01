import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { bootstrapMe } from "@/lib/server/api";
import { can } from "@/lib/e1";

export const Route = createFileRoute("/portal/feld/")({ component: Page });

function Page() {
  const [to, setTo] = useState<"/portal/gebiete" | "/app" | null>(null);
  useEffect(() => {
    bootstrapMe()
      .then((m) => setTo(can(m.profile.role, "team.view") ? "/portal/gebiete" : "/app"))
      .catch(() => setTo("/app"));
  }, []);
  if (!to) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  return <Navigate to={to} />;
}
