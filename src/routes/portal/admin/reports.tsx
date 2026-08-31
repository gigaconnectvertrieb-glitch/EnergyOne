import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { exportOpsCsv, getReports } from "@/lib/server/api";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { num } from "@/lib/utils";

export const Route = createFileRoute("/portal/admin/reports")({ component: Page });

function download(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getReports>> | null>(null);
  useEffect(() => {
    getReports().then(setData).catch(() => setData({ byDay: [], reasons: [], totals: { total: 0, storno: 0, won: 0 } }));
  }, []);
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  const t = data.totals ?? { total: 0, storno: 0, won: 0 };
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-4xl">Reports</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const file = await exportOpsCsv({ data: "auftraege" });
                download(file.filename, file.csv);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
              }
            }}
          >
            Aufträge CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const file = await exportOpsCsv({ data: "provisionen" });
                download(file.filename, file.csv);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
              }
            }}
          >
            Provision CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const file = await exportOpsCsv({ data: "datev" });
                download(file.filename, file.csv);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
              }
            }}
          >
            DATEV CSV
          </Button>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs text-muted">Aufträge</p>
          <p className="font-display text-3xl tabular-nums">{num(t.total)}</p>
        </div>
        <div className="rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs text-muted">Gewonnen</p>
          <p className="font-display text-3xl tabular-nums">{num(t.won)}</p>
        </div>
        <div className="rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs text-muted">Stornos</p>
          <p className="font-display text-3xl tabular-nums">{num(t.storno)}</p>
        </div>
      </div>
      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <h2 className="mb-4 text-sm font-medium">Abschlüsse nach Tag</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byDay}>
              <XAxis dataKey="d" tick={{ fill: "#9a9588", fontSize: 10 }} />
              <YAxis tick={{ fill: "#9a9588", fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#181c24", border: "1px solid #2a2d36" }} />
              <Bar dataKey="n" fill="#c9a227" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <h2 className="mt-8 font-display text-2xl">Stornogründe</h2>
      <ul className="mt-3 space-y-2">
        {data.reasons.map((r) => (
          <li key={r.reason} className="flex justify-between rounded-2xl bg-surface px-4 py-3 gold-hairline">
            <span>{r.reason}</span>
            <span className="tabular-nums text-gold">{r.n}</span>
          </li>
        ))}
        {data.reasons.length === 0 ? <li className="text-sm text-muted">Keine Stornos.</li> : null}
      </ul>
    </div>
  );
}
