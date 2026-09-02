import { useEffect, useState } from "react";
import { bootstrapMe } from "@/lib/server/api";

export function ServerLive() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    async function tick() {
      try {
        await bootstrapMe();
        if (on) setOk(true);
      } catch {
        if (on) setOk(false);
      }
    }
    void tick();
    const id = window.setInterval(tick, 45000);
    return () => {
      on = false;
      window.clearInterval(id);
    };
  }, []);
  return (
    <span className={ok === false ? "text-[10px] uppercase tracking-widest text-red-400" : "text-[10px] uppercase tracking-widest text-gold/80"}>
      {ok === false ? "Kein Server" : "Live · Server"}
    </span>
  );
}
