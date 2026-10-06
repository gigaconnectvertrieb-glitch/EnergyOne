import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FieldRouter } from "@/components/field-router";
import { bootstrapMe } from "@/lib/server/api";
import { can } from "@/lib/e1";

export const Route = createFileRoute("/app/karte")({ component: Page });

function Page() {
  const [planner, setPlanner] = useState(false);
  useEffect(() => {
    bootstrapMe()
      .then((m) => setPlanner(can(m.profile.role, "team.view")))
      .catch(() => setPlanner(false));
  }, []);
  return (
    <div className="grid gap-3">
      {planner ? (
        <a className="rounded-2xl bg-surface px-4 py-3 text-sm font-medium" href="/portal/gebiete">
          Gebiete planen und Mitarbeitern aufspielen
        </a>
      ) : null}
      <FieldRouter center={{ lat: 51.16, lng: 10.45 }} planner={planner} />
    </div>
  );
}
