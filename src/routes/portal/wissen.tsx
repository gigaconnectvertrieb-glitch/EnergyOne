import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeArticle, listArticles } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/wissen")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listArticles>>>([]);
  const [open, setOpen] = useState<string | null>(null);
  function load() {
    listArticles().then(setRows);
  }
  useEffect(load, []);
  const current = rows.find((r) => r.id === open);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-4xl">Wissen & Schulung</h1>
      <p className="text-sm text-muted">Pflichtmodule vor dem Außendienst abschließen.</p>
      <div className="mt-6 grid gap-2">
        {rows.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpen(a.id)}
            className="flex items-center justify-between rounded-2xl bg-surface p-4 text-left gold-hairline"
          >
            <span>
              <span className="block font-medium">{a.title}</span>
              <span className="text-xs text-muted">
                {a.category}
                {a.required ? " · Pflicht" : ""}
              </span>
            </span>
            <span className={a.done ? "text-success text-xs" : "text-muted text-xs"}>
              {a.done ? "Erledigt" : "Offen"}
            </span>
          </button>
        ))}
      </div>
      {current ? (
        <article className="mt-6 rounded-3xl bg-surface p-6 gold-hairline">
          <h2 className="font-display text-3xl">{current.title}</h2>
          <div className="mt-4 space-y-3 whitespace-pre-wrap text-sm text-muted">{current.body}</div>
          {!current.done ? (
            <Button
              className="mt-6"
              onClick={async () => {
                await completeArticle({ data: current.id });
                toast.success("Als gelesen markiert");
                load();
              }}
            >
              Als gelesen markieren
            </Button>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
