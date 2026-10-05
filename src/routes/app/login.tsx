/**
 * Mitarbeiter- & Leitungs-Login (E1 Tour / Feld)
 * ---------------------------------------------
 * Login:     5-stellige Mitarbeiter-ID + 6-stelliges Authenticator-OTP
 * Registrieren: ID + 4-stelliger Invite → QR/Secret → OTP bestätigen
 * Leitung:   orhan/luca + 12-stelliger Generalschlüssel
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { finishInvite, loginMaster, loginTotp, startInvite } from "@/lib/server/staff-auth";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/app/login")({
  head: () => ({ meta: [{ title: "E1 · Anmelden" }] }),
  component: Login,
});

const box =
  "relative z-20 block w-full rounded-xl border border-line bg-[#181c24] px-3 py-3 text-base text-[#f4f1e8] outline-none focus:border-gold";

function Login() {
  const [mode, setMode] = useState<"in" | "reg" | "admin">("in");
  const [staffId, setStaffId] = useState("");
  const [totp, setTotp] = useState("");
  const [invite, setInvite] = useState("");
  const [master, setMaster] = useState("");
  const [setup, setSetup] = useState<{
    secret: string;
    uri: string;
    firstName: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function goApp() {
    window.location.assign("/app");
  }
  async function goPortal() {
    window.location.assign("/portal");
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
          <p className="mt-4 max-w-sm text-sm text-white/80">
            Außendienst und Büro — ein Login, ein System.
          </p>
        </div>
      </div>

      <div className="grid place-items-center px-6 py-12">
        <div className="w-full max-w-sm">
          <BrandLockup className="mx-auto mb-2 max-h-24 w-auto" />
          <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-gold">E1 Zugang</p>
          <h1 className="mt-2 font-display text-4xl">Anmelden</h1>

          <div className="mt-6 flex gap-4 text-xs">
            {(
              [
                ["in", "Mitarbeiter"],
                ["reg", "Erstregistrierung"],
                ["admin", "Leitung"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={mode === id ? "text-gold" : "text-muted"}
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

          {mode === "in" && (
            <form
              className="mt-6 grid gap-3"
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await loginTotp({
                    data: {
                      staffId: staffId.replace(/\D/g, "").slice(0, 5),
                      totp: totp.replace(/\D+/g, ""),
                    },
                  });
                  await goApp();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Login fehlgeschlagen");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="text-sm text-muted">
                5-stellige Mitarbeiter-ID und Code aus der Authenticator-App
                (Google Authenticator, Authy, …).
              </p>
              <label className="block text-xs text-muted">
                Mitarbeiter-ID
                <input
                  className={box + " mt-1.5"}
                  placeholder="z. B. 10014"
                  inputMode="numeric"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  autoCapitalize="none"
                  required
                />
              </label>
              <label className="block text-xs text-muted">
                Code aus der App (6 Ziffern)
                <input
                  className={box + " mt-1.5"}
                  placeholder="123456"
                  inputMode="numeric"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </label>
              <Button disabled={busy}>{busy ? "…" : "Anmelden"}</Button>
              <p className="text-xs text-muted">
                Noch keine App eingerichtet? → Tab „Erstregistrierung“.
              </p>
            </form>
          )}

          {mode === "reg" && (
            <form
              className="mt-6 grid gap-3"
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setBusy(true);
                try {
                  if (!setup) {
                    const s = await startInvite({
                      data: {
                        staffId: staffId.replace(/\D/g, "").slice(0, 5),
                        code: invite.replace(/\D/g, "").slice(0, 4),
                      },
                    });
                    setSetup(s);
                    toast.success(`Hallo ${s.firstName} — Authenticator einrichten.`);
                  } else {
                    await finishInvite({
                      data: {
                        staffId: staffId.replace(/\D/g, "").slice(0, 5),
                        code: invite.replace(/\D/g, "").slice(0, 4),
                        totp: totp.replace(/\D+/g, ""),
                      },
                    });
                    toast.success("Registrierung fertig.");
                    await goApp();
                  }
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Registrierung fehlgeschlagen",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="text-sm text-muted">
                Einmalig: ID und Invite-Code von Orhan/Luca. Dann QR-Code in der
                Authenticator-App scannen.
              </p>
              <label className="block text-xs text-muted">
                Mitarbeiter-ID (5 Ziffern)
                <input
                  className={box + " mt-1.5"}
                  placeholder="10014"
                  inputMode="numeric"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  required
                />
              </label>
              <label className="block text-xs text-muted">
                Invite-Code (4 Ziffern)
                <input
                  className={box + " mt-1.5"}
                  placeholder="4821"
                  inputMode="numeric"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  required
                />
              </label>

              {setup && (
                <>
                  <p className="text-sm">
                    App öffnen → Konto hinzufügen → QR scannen oder Secret eingeben:
                  </p>
                  <img
                    alt="QR-Code Authenticator"
                    className="mx-auto rounded-xl bg-white p-2"
                    width={180}
                    height={180}
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setup.uri)}`}
                  />
                  <p className="break-all text-center font-mono text-sm text-gold">
                    {setup.secret}
                  </p>
                  <label className="block text-xs text-muted">
                    Erster Code aus der App
                    <input
                      className={box + " mt-1.5"}
                      placeholder="6 Ziffern"
                      inputMode="numeric"
                      value={totp}
                      onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                    />
                  </label>
                </>
              )}

              <Button disabled={busy}>
                {busy ? "…" : setup ? "Registrierung abschließen" : "Code prüfen"}
              </Button>
            </form>
          )}

          {mode === "admin" && (
            <form
              className="mt-6 grid gap-3"
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await loginMaster({
                    data: {
                      staffId: staffId.trim().toLowerCase(),
                      key: master.replace(/\D+/g, ""),
                    },
                  });
                  await goPortal();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Schlüssel ungültig",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="text-sm text-muted">
                Nur Orhan und Luca. Mitarbeiter nutzen „Mitarbeiter“ oder
                „Erstregistrierung“.
              </p>
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
                Generalschlüssel (12 Ziffern)
                <input
                  className={box + " mt-1.5"}
                  placeholder="••••••••••••"
                  inputMode="numeric"
                  value={master}
                  onChange={(e) => setMaster(e.target.value)}
                  required
                />
              </label>
              <Button disabled={busy}>{busy ? "…" : "Ins Portal"}</Button>
            </form>
          )}

          <a href="/" className="mt-8 block text-center text-xs text-muted">
            Zur Website
          </a>
        </div>
      </div>
    </main>
  );
}
