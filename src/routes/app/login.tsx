import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { finishInvite, loginMaster, loginTotp, startInvite } from "@/lib/server/staff-auth";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/app/login")({
  head: () => ({ meta: [{ title: "E1 Tour · Login" }] }),
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
    window.location.assign("/app");
  }

  return (
    <main className="min-h-dvh bg-[#07080c] text-ink lg:grid lg:grid-cols-2">
      <div className="relative hidden min-h-dvh lg:block">
        <img
          src="https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1400&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-[#07080c]/50 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10">
          <BrandLockup />
          <p className="mt-4 max-w-sm text-sm text-white/80">Außendienst. Gebiet, Tür, Abschluss — ein System.</p>
        </div>
      </div>
      <div className="grid place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="lg:hidden">
          <BrandLockup />
        </div>
        <BrandLockup />
        <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-gold">E1 Tour</p>
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
            <Button disabled={busy}>{busy ? "…" : "In E1 Tour"}</Button>
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
            <input className={box} placeholder="5-stellige Mitarbeiter-ID" inputMode="numeric" value={staffId} onChange={(e) => setStaffId(e.target.value.replace(/\D/g, "").slice(0, 5))} />
            <input className={box} placeholder="4-stelliger Invite" inputMode="numeric" value={invite} onChange={(e) => setInvite(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            {setup ? (
              <>
                <img
                  alt="QR"
                  className="mx-auto rounded-xl bg-white p-2"
                  width={180}
                  height={180}
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setup.uri)}`}
                />
                <p className="break-all font-mono text-sm text-gold">{setup.secret}</p>
                <input className={box} placeholder="Authenticator" inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} />
              </>
            ) : null}
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
                nav({ to: "/portal" });
                window.location.assign("/portal");
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
        <a href="/" className="mt-8 block text-center text-xs text-muted">
          Zur Website
        </a>
      </div>
      </div>
    </main>
  );
}
