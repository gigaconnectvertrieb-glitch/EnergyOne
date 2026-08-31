import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { finishInvite, loginMaster, loginTotp, startInvite } from "@/lib/server/staff-auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { BrandLockup } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

type Mode = "in" | "reg" | "admin";

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
      await loginTotp({ data: { staffId, totp } });
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
        const started = await startInvite({ data: { staffId, code: invite } });
        setSetup(started);
        toast.success("Passt. Jetzt Google Authenticator einrichten.");
      } else {
        await finishInvite({ data: { staffId, code: invite, totp } });
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
      await loginMaster({ data: { key: master } });
      await goPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generalschlüssel ungültig");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh gold-wash">
      <img
        src="/office-night.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-bg/40" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
        <BrandLockup className="mx-auto h-44 w-auto" />
        <div className="mt-8 rounded-3xl bg-surface/90 p-6 gold-hairline backdrop-blur">
          <h1 className="font-display text-3xl">Mitarbeiter-Portal</h1>
          <p className="mt-2 text-sm text-muted">
            Mitarbeiter: Google Authenticator. Leitung: Generalschlüssel.
          </p>

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
                  setTotp("");
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "in" ? (
            <form className="mt-5 grid gap-3" onSubmit={onLogin}>
              <Field label="Mitarbeiter-ID">
                <Input
                  autoComplete="username"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  required
                />
              </Field>
              <Field label="Google Authenticator (6 Ziffern)">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                  required
                  minLength={6}
                  maxLength={6}
                />
              </Field>
              <Button type="submit" disabled={busy} className="mt-1 w-full">
                Anmelden
              </Button>
            </form>
          ) : null}

          {mode === "reg" ? (
            <form className="mt-5 grid gap-3" onSubmit={onInvite}>
              <Field label="Mitarbeiter-ID">
                <Input
                  autoComplete="username"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  required
                  disabled={Boolean(setup)}
                />
              </Field>
              <Field label="5-stelliger Code aus dem Admin-Portal">
                <Input
                  inputMode="numeric"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.replace(/\D+/g, "").slice(0, 5))}
                  required
                  minLength={5}
                  maxLength={5}
                  disabled={Boolean(setup)}
                />
              </Field>
              {setup ? (
                <>
                  <p className="text-sm text-muted">
                    Hallo {setup.firstName}. Das ist euer Key für Google Authenticator — Konto hinzufügen →
                    Schlüssel eingeben.
                  </p>
                  <p className="break-all rounded-2xl bg-elevated px-3 py-3 font-mono text-sm tracking-[0.18em] text-gold">
                    {setup.secret}
                  </p>
                  <a
                    className="text-center text-xs text-gold underline"
                    href={setup.uri}
                  >
                    Oder hier tippen, wenn die App auf diesem Handy ist
                  </a>
                  <img
                    alt="QR für Authenticator"
                    className="mx-auto rounded-xl bg-white p-2"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setup.uri)}`}
                  />
                  <Field label="Code aus der App (6 Ziffern)">
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totp}
                      onChange={(e) => setTotp(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                      required
                      minLength={6}
                      maxLength={6}
                    />
                  </Field>
                </>
              ) : null}
              <Button type="submit" disabled={busy} className="mt-1 w-full">
                {setup ? "Registrieren und einloggen" : "Schlüssel prüfen"}
              </Button>
            </form>
          ) : null}

          {mode === "admin" ? (
            <form className="mt-5 grid gap-3" onSubmit={onAdmin}>
              <Field label="12-stelliger Generalschlüssel">
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  value={master}
                  onChange={(e) => setMaster(e.target.value.replace(/\D+/g, "").slice(0, 12))}
                  required
                  minLength={12}
                  maxLength={12}
                />
              </Field>
              <p className="text-xs text-muted">Ohne Google Authenticator. Nur Geschäftsführung.</p>
              <Button type="submit" disabled={busy} className="mt-1 w-full">
                Admin-Zugang
              </Button>
            </form>
          ) : null}
        </div>
        <Link to="/" className="mt-6 text-center text-sm text-muted">
          Zurück zur Website
        </Link>
      </div>
    </main>
  );
}
