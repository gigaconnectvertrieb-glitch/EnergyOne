import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listQueued, reopenQueued } from "@/lib/offline-queue";
import { flushOfflineContracts } from "@/lib/offline-sync";

export function OfflineBar() {
  const nav = useNavigate();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [left, setLeft] = useState(0);

  async function refresh() {
    try {
      setLeft((await listQueued()).length);
    } catch {
      setLeft(0);
    }
  }

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void refresh();
    const t = window.setInterval(() => void refresh(), 8000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    void flushOfflineContracts().then((r) => setLeft(r.left));
  }, [online]);

  if (online && left === 0) return null;
  return (
    <button
      type="button"
      className="w-full rounded-xl bg-surface px-3 py-2 text-center text-xs text-gold"
      onClick={async () => {
        const ok = await reopenQueued("");
        if (ok) nav({ to: "/app/abschluss" });
        else nav({ to: "/app/bilanz" });
      }}
    >
      {online ? `${left} Abschluss${left === 1 ? "" : "e"} werden nachgeschickt · antippen` : "Kein Netz. Aufträge bleiben auf dem Gerät."}
    </button>
  );
}