import { useEffect, useState } from "react";
import { beginTotp, checkTotp, confirmTotp } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Wordmark } from "./logo";

function sessionKey(userId: string) {
  return `e1-totp-ok:${userId}`;
}

export function totpSessionOk(userId: string) {
  try {
    return sessionStorage.getItem(sessionKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTotpOk(userId: string) {
  try {
    sessionStorage.setItem(sessionKey(userId), "1");
  } catch {
    /* private mode */
  }
}

export function TotpGate({
  userId,
  enabled,
  required,
  children,
}: {
  userId: string;
  enabled: boolean;
  required: boolean;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReady(true);
    setOk(totpSessionOk(userId));
  }, [userId]);

  if (!ready) return <>{children}</>;
  if (enabled && ok) return <>{children}</>;
  if (!required && !enabled) return <>{children}</>;

  const needSetup = required && !enabled;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (needSetup) {
        if (!secret) {
          setSecret(await beginTotp());
          setBusy(false);
          return;
        }
        await confirmTotp({ data: code.trim() });
        markTotpOk(userId);
        setOk(true);
        window.location.reload();
        return;
      }
      await checkTotp({ data: code.trim() });
      markTotpOk(userId);
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Code ungültig");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh gold-wash grid place-items-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 gold-hairline">
        <Wordmark className="justify-center" />
        <h1 className="mt-6 font-display text-3xl">
          {needSetup ? "2FA einrichten" : "Bestätigungscode"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {needSetup
            ? "Für Super-Admin und Backoffice ist TOTP Pflicht. Secret in Authenticator-App speichern."
            : "Zwei-Faktor ist aktiv. Code aus der App eingeben."}
        </p>
        {secret ? (
          <div className="mt-4 rounded-2xl bg-elevated p-4 text-sm">
            <p className="break-all font-mono text-gold">{secret.secret}</p>
            <p className="mt-2 break-all text-xs text-muted">{secret.uri}</p>
          </div>
        ) : null}
        {(secret || enabled) && (
          <div className="mt-4">
            <Field label="6-stelliger Code">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          </div>
        )}
        {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
        <Button className="mt-4 w-full" disabled={busy} onClick={submit}>
          {needSetup && !secret ? "Secret erzeugen" : "Bestätigen"}
        </Button>
      </div>
    </div>
  );
}
