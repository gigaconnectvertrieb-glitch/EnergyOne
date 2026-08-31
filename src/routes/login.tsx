import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { BrandLockup } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await authClient.signUp.email({ email, password, name });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message);
      }
      nav({ to: "/portal" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
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
            Für das E1-Team und Partner. Der erste Zugang wird Super-Admin.
          </p>
          <Link to="/vorschau" className="mt-4 block">
            <Button variant="outline" className="w-full" type="button">
              Vorschau Admin und Mitarbeiter
            </Button>
          </Link>
          <Link to="/app" className="mt-2 block">
            <Button variant="outline" className="w-full" type="button">
              Feld-App (iPhone & Android)
            </Button>
          </Link>
          {authEnabled ? (
            <>
              <div className="mt-5 grid gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    onClick={() => signIn(p.providerId, { callbackURL: "/portal" })}
                  >
                    Weiter mit {p.label}
                  </Button>
                ))}
              </div>
              <p className="my-4 text-center text-xs uppercase tracking-[0.2em] text-muted">
                oder per E-Mail
              </p>
              <form className="grid gap-3" onSubmit={onEmail}>
                {mode === "up" ? (
                  <Field label="Name">
                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                  </Field>
                ) : null}
                <Field label="E-Mail">
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Passwort">
                  <Input
                    type="password"
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </Field>
                <Button type="submit" disabled={busy} className="mt-1 w-full">
                  {mode === "in" ? "Anmelden" : "Konto erstellen"}
                </Button>
              </form>
              <button
                type="button"
                className="mt-4 w-full text-sm text-muted hover:text-ink"
                onClick={() => setMode(mode === "in" ? "up" : "in")}
              >
                {mode === "in" ? "Noch kein Konto? Registrieren" : "Bereits dabei? Anmelden"}
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Anmeldung ist deaktiviert.</p>
          )}
        </div>
        <Link to="/" className="mt-6 text-center text-sm text-muted">
          Zurück zur Website
        </Link>
      </div>
    </main>
  );
}
