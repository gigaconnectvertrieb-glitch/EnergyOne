import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listNotifications, markNotificationsRead } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { deDateTime } from "@/lib/utils";

export const Route = createFileRoute("/portal/benachrichtigungen")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);
  function load() {
    listNotifications().then(setRows);
  }
  useEffect(load, []);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Hinweise</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await markNotificationsRead();
            load();
          }}
        >
          Alle gelesen
        </Button>
      </div>
      <div className="mt-6 grid gap-2">
        {rows.map((n) => (
          <Link
            key={n.id}
            to={n.link || "/portal"}
            className="rounded-2xl bg-surface p-4 gold-hairline"
          >
            <p className="font-medium">
              {!n.read ? <span className="mr-2 inline-block size-2 rounded-full bg-gold" /> : null}
              {n.title}
            </p>
            <p className="text-sm text-muted">{n.message}</p>
            <p className="mt-1 text-xs text-muted">{deDateTime(n.created_at)}</p>
          </Link>
        ))}
        {rows.length === 0 ? <p className="text-sm text-muted">Keine Hinweise.</p> : null}
      </div>
    </div>
  );
}
