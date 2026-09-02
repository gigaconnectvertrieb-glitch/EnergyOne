import { useEffect, useState } from "react";
import { getMyGoal, savePush } from "@/lib/server/goal-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushEnable() {
  const [on, setOn] = useState(false);
  const [vapid, setVapid] = useState("");

  useEffect(() => {
    getMyGoal()
      .then((g) => {
        setOn(Boolean(g.pushOn));
        setVapid(g.vapidPublic || "");
      })
      .catch(() => {});
  }, []);

  async function enable() {
    if (!vapid) {
      toast.error("Push-Schlüssel fehlt. Seite neu laden.");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("Dieser Browser kann kein Push.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Mitteilungen blockiert.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const json = sub.toJSON();
      await savePush({
        data: {
          endpoint: json.endpoint,
          keys: json.keys as { p256dh?: string; auth?: string },
          userAgent: navigator.userAgent,
        },
      });
      setOn(true);
      toast.success("Push an.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push fehlgeschlagen");
    }
  }

  if (on) return <p className="text-xs text-gold">Push an — Gebiet und Notfall kommen aufs Handy.</p>;
  return (
    <Button variant="outline" className="w-full" onClick={() => void enable()}>
      Mitteilungen einschalten
    </Button>
  );
}
