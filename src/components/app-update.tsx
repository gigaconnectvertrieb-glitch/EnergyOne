import { useEffect, useState } from "react";
import { getBuild } from "@/lib/server/release-api";
import { Button } from "@/components/ui/button";

const KEY = "e1_app_build";

export function AppUpdate() {
  const [note, setNote] = useState("");
  const [show, setShow] = useState(false);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    getBuild()
      .then((b) => {
        const have = localStorage.getItem(KEY) || "";
        if (b.build && have && have !== b.build) {
          setNote(b.note || "Neue Version");
          setShow(true);
        }
        if (!have) localStorage.setItem(KEY, b.build);
      })
      .catch(() => {});
  }, []);
  if (!show) return null;
  return (
    <div className="mb-3 rounded-2xl bg-surface p-4 gold-hairline">
      <p className="text-sm font-medium">Update</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
      {pct > 0 ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated">
          <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <Button
          className="mt-3"
          onClick={() => {
            let n = 8;
            const t = window.setInterval(() => {
              n += 14;
              setPct(Math.min(100, n));
              if (n >= 100) {
                window.clearInterval(t);
                getBuild()
                  .then((b) => localStorage.setItem(KEY, b.build))
                  .finally(() => window.location.reload());
              }
            }, 180);
          }}
        >
          Aktualisieren
        </Button>
      )}
    </div>
  );
}
