import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listRegions, listStaffFlags, listUsers, setStaffFlag, updateUser } from "@/lib/server/api";
import { downloadHvContract } from "@/lib/server/hv-api";
import { createStaff } from "@/lib/server/staff-auth";
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
        Mitarbeiter anlegen → 5-stelligen Schlüssel mitgeben → der richtet Google Authenticator ein.
      </p>

      <form className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline md:grid-cols-2" onSubmit={onCreate}>
        <Field label="Mitarbeiter-ID (Benutzername)">
          <Input value={staffId} onChange={(e) => setStaffId(e.target.value)} required placeholder="z. B. 1001 oder orhan" />
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
                  <button
                    type="button"
                    className="mt-1 text-xs text-gold underline"
                    onClick={async () => {
                      try {
                        const file = await downloadHvContract({ data: { id: u.hv_contract_id! } });
                        const a = document.createElement("a");
                        a.href = `data:application/pdf;base64,${file.pdfBase64}`;
                        a.download = file.filename;
                        a.click();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Vertrag fehlt");
                      }
                    }}
                  >
                    HV-Vertrag in der Datenbank · PDF
                  </button>
                ) : u.role !== "super_admin" ? (
                  <p className="mt-1 text-xs text-muted">Noch kein HV-Vertrag — unter Verträge anlegen</p>
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
                <Select
                  value={u.status}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, status: e.target.value } });
                    toast.success("Status gesetzt");
                    load();
                  }}
                >
                  <option value="pending">Prüfung</option>
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                  <option value="blocked">Gesperrt</option>
                </Select>
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
