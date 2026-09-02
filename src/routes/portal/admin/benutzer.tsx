import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listRegions, listStaffFlags, listUsers, setStaffFlag, updateUser } from "@/lib/server/api";
import { createStaff, deleteStaff, issueStaffMaster } from "@/lib/server/staff-auth";
import { publishBuild } from "@/lib/server/release-api";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/e1";
import { STAFF_UNLOCKS } from "@/lib/features";
import { MAIL_DOMAIN, workspaceLocalPart } from "@/lib/mail";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/admin/benutzer")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [regions, setRegions] = useState<Awaited<ReturnType<typeof listRegions>>>([]);
  const [staffId, setStaffId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("vertrieb");
  const [issued, setIssued] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    listUsers().then(setRows);
    listRegions().then(setRegions);
  }
  useEffect(load, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await createStaff({ data: { firstName, lastName, email, role, staffId } });
      setIssued(created.inviteCode);
      toast.success(`ID ${created.staffId} · Schlüssel ${created.inviteCode}`);
      setFirstName("");
      setLastName("");
      setEmail("");
      setStaffId("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-4xl">Benutzer & Rechte</h1>
      <p className="text-sm text-muted">
        Mitarbeiter anlegen → 4-stelligen Invite und 5-stellige ID mitgeben. Der scannt den QR in der App und bestätigt Google Authenticator.
      </p>

      <form className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline md:grid-cols-2" onSubmit={onCreate}>
        <Field label="Mitarbeiter-ID (5 Ziffern, leer = automatisch)">
          <Input value={staffId} onChange={(e) => setStaffId(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="z. B. 10014" />
        </Field>
        <Field label="Vorname">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>
        <Field label="Nachname">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </Field>
        <Field label="E-Mail (optional)">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Rolle">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy}>
            Mitarbeiter anlegen
          </Button>
        </div>
        {issued ? (
          <p className="md:col-span-2 rounded-2xl bg-elevated px-4 py-3 text-sm">
            Schlüssel für die Registrierung:{" "}
            <span className="font-mono text-2xl tracking-[0.3em] text-gold">{issued}</span>
          </p>
        ) : null}
      </form>
      <div className="mt-4">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const r = await publishBuild({ data: { note: "Neue Version im Feld und am PC" } });
              toast.success(`Version ${r.build} — Push raus.`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Nicht gesendet");
            }
          }}
        >
          Update an alle schicken
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        {rows.map((u) => (
          <div key={u.user_id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {u.first_name} {u.last_name}
                </p>
                <p className="text-xs text-muted">
                  ID {u.staff_id || "—"} · {u.email || u.user_id} · {workspaceLocalPart(u.first_name, u.last_name)}@
                  {MAIL_DOMAIN} · {u.orders} Aufträge
                </p>
                {u.invite_code ? (
                  <p className="mt-1 font-mono text-sm text-gold">Schlüssel {u.invite_code} — noch nicht registriert</p>
                ) : null}
                {u.hv_contract_id ? (
                  <Link
                    to="/portal/admin/vertraege"
                    search={{ id: u.hv_contract_id }}
                    className="mt-1 inline-block text-xs text-gold underline"
                  >
                    HV-Vertrag lesen (Datenbank)
                  </Link>
                ) : u.role !== "super_admin" ? (
                  <p className="mt-1 text-xs text-muted">
                    Noch kein HV-Vertrag — links unter HV-Verträge anlegen und den Mitarbeiter auswählen.
                  </p>
                ) : null}
                {u.role !== "super_admin" ? <StaffUnlocks userId={u.user_id} /> : (
                  <p className="mt-2 text-xs text-gold">Geschäftsführung: alle Module frei</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={u.role}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, role: e.target.value as Role } });
                    toast.success("Rolle gesetzt");
                    load();
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={u.region_id || ""}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, regionId: e.target.value || null } });
                    load();
                  }}
                >
                  <option value="">Region</option>
                  {regions.map((r) => (
                    <option key={String(r.id)} value={String(r.id)}>
                      {String(r.name)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={String(u.commission_stufe || 1)}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, commissionStufe: Number(e.target.value) } });
                    toast.success("Stufe gesetzt");
                    load();
                  }}
                >
                  <option value="1">Stufe 1</option>
                  <option value="2">Stufe 2</option>
                  <option value="3">Stufe 3</option>
                  <option value="13">Stufe 13 · Agentur</option>
                </Select>
                <Input
                  placeholder="Auszahlungs-IBAN"
                  defaultValue={u.payout_iban || ""}
                  onBlur={async (e) => {
                    const v = e.target.value.trim();
                    if (v === (u.payout_iban || "")) return;
                    try {
                      await updateUser({ data: { userId: u.user_id, payoutIban: v } });
                      toast.success("IBAN gespeichert");
                      load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "IBAN ungültig");
                    }
                  }}
                />
                <Select
                  value={u.status}
                  onChange={async (e) => {
                    try {
                      await updateUser({ data: { userId: u.user_id, status: e.target.value } });
                      toast.success("Status gesetzt");
                      load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Nicht erlaubt");
                    }
                  }}
                >
                  <option value="pending">Prüfung</option>
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv · raus</option>
                  <option value="blocked">Gesperrt</option>
                </Select>
                {flash?.id === u.user_id ? (
                  <p className="mt-2 font-mono text-xl tracking-[0.2em] text-gold">{flash.key}</p>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const r = await issueStaffMaster({ data: { userId: u.user_id } });
                      setFlash({ id: u.user_id, key: r.key });
                      try {
                        await navigator.clipboard.writeText(r.key);
                      } catch {
                        /* */
                      }
                      toast.success("5 Sekunden sichtbar, dann weg.");
                      window.setTimeout(() => setFlash((cur) => (cur?.id === u.user_id ? null : cur)), 5000);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Nicht erzeugt");
                    }
                  }}
                >
                  Generalschlüssel
                </Button>
                {u.role !== "super_admin" && (u.status === "active" || u.status === "pending") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `${u.first_name} ${u.last_name} aus dem Team entfernen?\n\nLogin gesperrt, Gebiet weg, Workspace-Postfach gesperrt.\nAufträge und Provisionen bleiben in der Datenbank.`,
                        )
                      ) {
                        return;
                      }
                      try {
                        await updateUser({ data: { userId: u.user_id, status: "inactive" } });
                        toast.success("Aus dem Team entfernt");
                        load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Nicht erlaubt");
                      }
                    }}
                  >
                    Aus Team entfernen
                  </Button>
                ) : null}
                {u.role !== "super_admin" && (u.status === "inactive" || u.status === "blocked") ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await updateUser({ data: { userId: u.user_id, status: "active" } });
                        toast.success("Wieder im Team");
                        load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Nicht erlaubt");
                      }
                    }}
                  >
                    Wieder aufnehmen
                  </Button>
                ) : null}
                {u.role !== "super_admin" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger"
                    onClick={async () => {
                      const name = `${u.first_name} ${u.last_name}`;
                      if (!window.confirm(`${name} löschen? Login weg, ID frei.`)) return;
                      let purge = u.orders === 0;
                      if (u.orders > 0) {
                        purge = window.confirm(
                          `${u.orders} Aufträge hängen an ${name}.\nOK = Aufträge mitlöschen (für Testdummies).\nAbbrechen = Aufträge bleiben, Person verschwindet nur aus der Liste.`,
                        );
                      }
                      try {
                        await deleteStaff({ data: { userId: u.user_id, purgeContracts: purge } });
                        toast.success("Gelöscht");
                        load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
                      }
                    }}
                  >
                    Löschen
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffUnlocks({ userId }: { userId: string }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  useEffect(() => {
    listStaffFlags({ data: { userId } })
      .then(setFlags)
      .catch(() => setFlags({}));
  }, [userId]);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {STAFF_UNLOCKS.map((u) => {
        const on = Boolean(flags[u.key]);
        return (
          <button
            key={u.key}
            type="button"
            className={`rounded-full px-3 py-1 text-xs ${on ? "bg-gold text-bg" : "bg-elevated text-muted"}`}
            onClick={async () => {
              await setStaffFlag({ data: { userId, key: u.key, enabled: !on } });
              setFlags((f) => ({ ...f, [u.key]: !on }));
              toast.success(on ? `${u.label} aus` : `${u.label} an`);
            }}
          >
            {u.label}
          </button>
        );
      })}
    </div>
  );
}
