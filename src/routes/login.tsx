import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { loginMaster } from "@/lib/server/staff-auth";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

const box =
  "relative z-20 block w-full rounded-xl border border-line bg-[#181c24] px-3 py-3 text-base text-[#f4f1e8] outline-none focus:border-gold";

function Login() {
  const [staffId, setStaffId] = useState("");
  const [master, setMaster] = useState("");
  const [busy, setBusy] = useState(false);

  async function onAdmin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await loginMaster({ data: { staffId, key: master.replace(/\D+/g, "") } });
      window.location.assign("/portal");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Zugang nur für die Leitung.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <BrandLockup className="mx-auto mb-6 h-24 w-auto" />
        <div className="rounded-3xl bg-surface p-6 gold-hairline">
          <h1 className="font-display text-3xl">Leitung</h1>
          <p className="mt-2 text-sm text-muted">Nur Orhan und Luca. Mitarbeiter nutzen E1 Tour.</p>
          <form className="mt-5 space-y-4" onSubmit={onAdmin} autoComplete="off">
            <label className="block text-xs text-muted">
              Benutzername
              <input
                className={box + " mt-1.5"}
                placeholder="orhan oder luca"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs text-muted">
              Generalschlüssel
              <input
                className={box + " mt-1.5"}
                inputMode="numeric"
                value={master}
                onChange={(e) => setMaster(e.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={busy} className="w-full">
              Ins Portal
            </Button>
          </form>
        </div>
        <Link to="/" className="mt-6 block text-center text-sm text-muted">
          Zur Website
        </Link>
      </div>
    </main>
  );
}
