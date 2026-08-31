import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { finishInvite, loginMaster, loginTotp, startInvite } from "@/lib/server/staff-auth";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

type Mode = "in" | "reg" | "admin";

const box =
  "relative z-20 block w-full rounded-xl border border-line bg-[#181c24] px-3 py-3 text-base text-[#f4f1e8] outline-none focus:border-gold";

function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("in");
  const [staffId, setStaffId] = useState("");
  const [totp, setTotp] = useState("");
  const [invite, setInvite] = useState("");
  const [master, setMaster] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string; firstName: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function goPortal() {
    nav({ to: "/portal" });
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await loginTotp({ data: { staffId, totp: totp.replace(/\D+/g, "") } });
      await goPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!setup) {
        const started = await startInvite({
          data: { staffId, code: invite.replace(/\D+/g, "") },
        });
        setSetup(started);
        toast.success("Passt. Jetzt Google Authenticator einrichten.");
      } else {
        await finishInvite({
          data: { staffId, code: invite.replace(/\D+/g, ""), totp: totp.replace(/\D+/g, "") },
        });
        await goPortal();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registrierung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onAdmin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await loginMaster({ data: { staffId, key: master.replace(/\D+/g, "") } });
      await goPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generalschlüssel ungültig");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-bg px-4 py-8 pb-32">
      <div className="mx-auto w-full max-w-md">
        <BrandLockup className="mx-auto mb-6 h-24 w-auto" />
        <div className="rounded-3xl bg-surface p-6 gold-hairline">
          <h1 className="font-display text-3xl">Mitarbeiter-Portal</h1>
          <p className="mt-2 text-sm text-muted">Mitarbeiter: Authenticator. Leitung: Generalschlüssel.</p>

          <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-elevated p-1 text-xs">
            {(
              [
                ["in", "Anmelden"],
                ["reg", "Registrieren"],
                ["admin", "Admin"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`min-h-10 rounded-xl ${mode === id ? "bg-gold text-bg" : "text-muted"}`}
                onClick={() => {
                  setMode(id);
                  setSetup(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "in" ? (
            <form className="mt-5 space-y-4" onSubmit={onLogin}>
              <label className="block text-xs text-muted">
                Mitarbeiter-ID
                <input className={box + " mt-1.5"} name="staff" autoComplete="username" value={staffId} onChange={(e) => setStaffId(e.target.value)} required />
              </label>
              <label className="block text-xs text-muted">
                Google Authenticator (6 Ziffern)
                <input className={box + " mt-1.5"} name="totp" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} required />
              </label>
              <Button type="submit" disabled={busy} className="w-full">
                Anmelden
              </Button>
            </form>
          ) : null}

          {mode === "reg" ? (
            <form className="mt-5 space-y-4" onSubmit={onInvite}>
              <label className="block text-xs text-muted">
                Mitarbeiter-ID
                <input className={box + " mt-1.5"} name="reg-staff" autoComplete="username" value={staffId} onChange={(e) => setStaffId(e.target.value)} required />
              </label>
              <label className="block text-xs text-muted">
                5-stelliger Code
                <input className={box + " mt-1.5"} name="reg-code" value={invite} onChange={(e) => setInvite(e.target.value)} required />
              </label>
              {setup ? (
                <>
                  <p className="text-sm text-muted">Hallo {setup.firstName}. Key für Google Authenticator:</p>
                  <p className="break-all rounded-2xl bg-elevated px-3 py-3 font-mono text-sm text-gold">{setup.secret}</p>
                  <label className="block text-xs text-muted">
                    Code aus der App
                    <input className={box + " mt-1.5"} name="reg-totp" value={totp} onChange={(e) => setTotp(e.target.value)} required />
                  </label>
                </>
              ) : null}
              <Button type="submit" disabled={busy} className="w-full">
                {setup ? "Registrieren und einloggen" : "Schlüssel prüfen"}
              </Button>
            </form>
          ) : null}

          {mode === "admin" ? (
            <form className="mt-5 space-y-4" onSubmit={onAdmin} autoComplete="off">
              <label className="block text-xs text-muted">
                Benutzername
                <input
                  className={box + " mt-1.5"}
                  name="admin-user"
                  autoComplete="off"
                  placeholder="orhan oder luca"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  required
                />
              </label>
              <label className="block text-xs text-muted">
                12-stelliger Generalschlüssel
                <input
                  className={box + " mt-1.5"}
                  name="admin-key"
                  autoComplete="off"
                  inputMode="numeric"
                  placeholder="12 Ziffern"
                  value={master}
                  onChange={(e) => setMaster(e.target.value)}
                  required
                />
              </label>
              <p className="text-xs text-muted">Ohne Google Authenticator. Getrennte Logins.</p>
              <Button type="submit" disabled={busy} className="w-full">
                Admin-Zugang
              </Button>
            </form>
          ) : null}
        </div>
        <Link to="/" className="mt-6 block text-center text-sm text-muted">
          Zurück zur Website
        </Link>
      </div>
    </main>
  );
}
