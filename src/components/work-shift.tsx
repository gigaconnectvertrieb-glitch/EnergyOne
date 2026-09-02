import { useEffect, useState } from "react";
import { myShift, pingWork, startWork, stopWork } from "@/lib/server/work-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function here(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("Standort erlauben")),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  });
}

async function addressOf(lat: number, lng: number) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const json = (await res.json()) as { display_name?: string };
    return json.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export function WorkShift() {
  const [shift, setShift] = useState<Awaited<ReturnType<typeof myShift>>>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    myShift().then(setShift).catch(() => setShift(null));
  }, []);

  useEffect(() => {
    if (!shift) return;
    let on = true;
    async function tick() {
      try {
        const p = await here();
        if (!on) return;
        await pingWork({ data: { lat: p.lat, lng: p.lng, address: await addressOf(p.lat, p.lng) } });
      } catch {
        /* */
      }
    }
    const id = window.setInterval(() => void tick(), 60000);
    return () => {
      on = false;
      window.clearInterval(id);
    };
  }, [shift]);

  async function start() {
    setBusy(true);
    try {
      const p = await here();
      const address = await addressOf(p.lat, p.lng);
      await startWork({ data: { lat: p.lat, lng: p.lng, address } });
      setShift(await myShift());
      toast.success("Arbeit läuft · Standort erfasst");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Start fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await stopWork();
      setShift(null);
      toast.success("Arbeit beendet");
    } finally {
      setBusy(false);
    }
  }

  if (shift) {
    return (
      <Button variant="outline" disabled={busy} onClick={() => void stop()} className="h-8 px-2 text-[10px]">
        Arbeit beenden
      </Button>
    );
  }
  return (
    <Button disabled={busy} onClick={() => void start()} className="h-8 px-2 text-[10px]">
      Arbeit starten
    </Button>
  );
}
