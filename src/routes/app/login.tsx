import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { finishInvite, loginMaster, loginTotp, startInvite } from "@/lib/server/staff-auth";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/app/login")({
  head: () => ({ meta: [{ title: "E1 Feld · Login" }] }),
  component: Login,
});

const box =
  "relative z-20 block w-full rounded-xl border border-line bg-[#181c24] px-3 py-3 text-base text-[#f4f1e8] outline-none focus:border-gold";

function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "reg" | "admin">("in");
  const [staffId, setStaffId] = useState("");
  const [totp, setTotp] = useState("");
  const [invite, setInvite] = useState("");
  const [master, setMaster] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string; firstName: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    nav({ to: "/app" });
  }

  return (
    <main className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <BrandLockup />
        <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-gold">Feld-App</p>
        <h1 className="mt-2 font-display text-4xl">Anmelden</h1>
        <p className="mt-3 text-sm text-muted">Mitarbeiter: Benutzername und Authenticator. Leitung: Generalschlüssel.</p>
        <div className="mt-6 flex gap-2 text-xs">
          <button type="button" className={mode === "in" ? "text-gold" : "text-muted"} onClick={() => setMode("in")}>
            Login
          </button>
          <button type="button" className={mode === "reg" ? "text-gold" : "text-muted"} onClick={() => setMode("reg")}>
            Registrieren
          </button>
          <button type="button" className={mode === "admin" ? "text-gold" : "text-muted"} onClick={() => setMode("admin")}>
            Leitung
          </button>
        </div>
        {mode === "in" ? (
          <form
            className="mt-6 grid gap-3"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              setBusy(true);
              try {
                await loginTotp({ data: { staffId, totp: totp.replace(/\D+/g, "") } });
                await go();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Login fehlgeschlagen");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input className={box} placeholder="Benutzername" value={staffId} onChange={(e) => setStaffId(e.target.value)} autoCapitalize="none" />
            <input className={box} placeholder="Authenticator" inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} />
            <Button disabled={busy}>{busy ? "…" : "In die Feld-App"}</Button>
          </form>
        ) : null}
        {mode === "reg" ? (
          <form
            className="mt-6 grid gap-3"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              setBusy(true);
              try {
                if (!setup) {
                  setSetup(await startInvite({ data: { staffId, code: invite.replace(/\D+/g, "") } }));
                  toast.success("Authenticator einrichten.");
                } else {
                  await finishInvite({
                    data: { staffId, code: invite.replace(/\D+/g, ""), totp: totp.replace(/\D+/g, "") },
                  });
                  await go();
                }
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Registrierung fehlgeschlagen");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input className={box} placeholder="Benutzername" value={staffId} onChange={(e) => setStaffId(e.target.value)} />
            <input className={box} placeholder="5-stelliger Code" inputMode="numeric" value={invite} onChange={(e) => setInvite(e.target.value)} />
            {setup ? <input className={box} placeholder="Authenticator" inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} /> : null}
            <Button disabled={busy}>{setup ? "Bestätigen" : "Code prüfen"}</Button>
          </form>
        ) : null}
        {mode === "admin" ? (
          <form
            className="mt-6 grid gap-3"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              setBusy(true);
              try {
                await loginMaster({ data: { staffId, key: master.replace(/\D+/g, "") } });
                await go();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Schlüssel ungültig");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input className={box} placeholder="Benutzername" value={staffId} onChange={(e) => setStaffId(e.target.value)} />
            <input className={box} placeholder="12-stelliger Schlüssel" inputMode="numeric" value={master} onChange={(e) => setMaster(e.target.value)} />
            <p className="text-xs text-muted">Leitung: fester Schlüssel. Mitarbeiter: den eben erzeugten, wenn der Authenticator ausfällt.</p>
            <Button disabled={busy}>Leitung anmelden</Button>
          </form>
        ) : null}
        <Link to="/login" className="mt-8 block text-center text-xs text-muted">
          Zum Büro-Portal
        </Link>
      </div>
    </main>
  );
}
