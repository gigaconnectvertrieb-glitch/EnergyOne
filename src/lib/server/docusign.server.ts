import { SignJWT, importPKCS8 } from "jose";
import { createPrivateKey } from "node:crypto";
import {
  DOCUSIGN_ENV,
  DOCUSIGN_OPTIONAL_ENV,
  buildPagedPdf,
  shouldImportSignedPdf,
  signEventToStatus,
  type SignStatus,
} from "@/lib/sign";
import { asStr, nid } from "@/lib/utils";
import { notify, sql } from "./helpers";
import { putFile } from "./ops.server";
import { fillVertrag, type VertragArt } from "@/lib/vertrag";

function env(key: string) {
  return (process.env[key] ?? "").trim();
}

function privateKeyPem() {
  const raw = env("DOCUSIGN_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!raw) return "";
  try {
    const k = createPrivateKey(raw);
    return k.export({ type: "pkcs8", format: "pem" }).toString();
  } catch {
    return raw;
  }
}

export function docusignReady() {
  return DOCUSIGN_ENV.every((k) => Boolean(env(k)));
}

export function docusignConnection() {
  return {
    ready: docusignReady(),
    env_keys: [...DOCUSIGN_ENV],
    optional_keys: [...DOCUSIGN_OPTIONAL_ENV],
    missing: DOCUSIGN_ENV.filter((k) => !env(k)),
    oauth_base: env("DOCUSIGN_OAUTH_BASE") || "https://account-d.docusign.com",
    webhook: "/api/docusign/connect",
  };
}

let tokenCache: { token: string; exp: number; base: string } | null = null;

async function docusignToken() {
  if (!docusignReady()) return null;
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache;
  const oauth = (env("DOCUSIGN_OAUTH_BASE") || "https://account-d.docusign.com").replace(/\/+$/, "");
  const pk = await importPKCS8(privateKeyPem(), "RS256");
  const jwt = await new SignJWT({ scope: "signature impersonation" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env("DOCUSIGN_INTEGRATION_KEY"))
    .setSubject(env("DOCUSIGN_USER_ID"))
    .setAudience(oauth)
    .setIssuedAt()
    .setExpirationTime("50m")
    .sign(pk);
  const res = await fetch(`${oauth}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) return null;
  const info = await fetch(`${oauth}/oauth/userinfo`, {
    headers: { authorization: `Bearer ${json.access_token}` },
  });
  const user = (await info.json()) as { accounts?: Array<{ account_id: string; base_uri: string }> };
  const acc =
    user.accounts?.find((a) => a.account_id === env("DOCUSIGN_ACCOUNT_ID")) || user.accounts?.[0];
  const base = (acc?.base_uri || "https://demo.docusign.net").replace(/\/+$/, "");
  tokenCache = {
    token: json.access_token,
    exp: now + (json.expires_in ?? 3000),
    base,
  };
  return tokenCache;
}

export async function sendDocusignEnvelope(input: {
  email: string;
  name: string;
  pdf: Buffer;
  contractId: string;
  subject?: string;
  blurb?: string;
  filename?: string;
  companyEmail?: string;
  companyName?: string;
}) {
  const auth = await docusignToken();
  if (!auth) throw new Error("DocuSign ist nicht verbunden.");
  const account = env("DOCUSIGN_ACCOUNT_ID");
  const body = {
    emailSubject: input.subject || "Ihr E1-Vertrag zur Unterschrift",
    emailBlurb:
      input.blurb ||
      "Bitte den Vertrag digital unterschreiben. Nach der Unterschrift liegt er automatisch bei E1 Direktvertrieb.",
    status: "sent",
    documents: [
      {
        documentBase64: input.pdf.toString("base64"),
        name: input.filename || `E1-Vertrag-${input.contractId}.pdf`,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: [
        ...(input.companyEmail
          ? [
              {
                email: input.companyEmail,
                name: input.companyName || "E1 Direktvertrieb",
                recipientId: "1",
                routingOrder: "1",
                tabs: { signHereTabs: [{ anchorString: "/sign1/", anchorUnits: "pixels", anchorYOffset: "-10" }] },
              },
            ]
          : []),
        {
          email: input.email,
          name: input.name,
          recipientId: input.companyEmail ? "2" : "1",
          routingOrder: input.companyEmail ? "2" : "1",
          tabs: {
            signHereTabs: [
              {
                anchorString: input.companyEmail ? "/sign2/" : "/sign1/",
                anchorUnits: "pixels",
                anchorYOffset: "-10",
              },
            ],
          },
        },
      ],
    },
  };
  const res = await fetch(`${auth.base}/restapi/v2.1/accounts/${account}/envelopes`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { envelopeId?: string; message?: string; errorCode?: string };
  if (!res.ok || !json.envelopeId) {
    throw new Error(json.message || json.errorCode || "DocuSign hat den Versand abgelehnt.");
  }
  return json.envelopeId;
}

export async function downloadSignedPdf(envelopeId: string) {
  const auth = await docusignToken();
  if (!auth) return null;
  const account = env("DOCUSIGN_ACCOUNT_ID");
  const res = await fetch(
    `${auth.base}/restapi/v2.1/accounts/${account}/envelopes/${envelopeId}/documents/combined`,
    { headers: { authorization: `Bearer ${auth.token}` } },
  );
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export async function getEnvelopeStatus(envelopeId: string) {
  const auth = await docusignToken();
  if (!auth) return null;
  const account = env("DOCUSIGN_ACCOUNT_ID");
  const res = await fetch(`${auth.base}/restapi/v2.1/accounts/${account}/envelopes/${envelopeId}`, {
    headers: { authorization: `Bearer ${auth.token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { status?: string };
  return json.status || null;
}

export async function pollPendingSignatures() {
  if (!docusignReady()) return { checked: 0, completed: 0 };
  const db = await sql();
  const rows = await db<{ id: string; docusign_envelope_id: string }>`
    select id, docusign_envelope_id from sign_envelopes
    where provider = 'docusign'
      and docusign_envelope_id is not null
      and status in ('queued', 'sent', 'delivered')
    order by sent_at desc
    limit 40
  `;
  let completed = 0;
  for (const row of rows) {
    const st = await getEnvelopeStatus(row.docusign_envelope_id);
    if (!st) continue;
    const mapped = signEventToStatus(st);
    if (!mapped) continue;
    const r = await applyEnvelopeEvent(row.docusign_envelope_id, st);
    if (r.ok && mapped === "completed") completed += 1;
  }
  return { checked: rows.length, completed };
}

export async function applyEnvelopeEvent(envelopeId: string, event: string) {
  const status = signEventToStatus(event);
  if (!status) return { ok: false as const, reason: "unmapped" };
  const db = await sql();
  const [row] = await db<Record<string, unknown>>`
    select * from sign_envelopes where docusign_envelope_id = ${envelopeId} limit 1
  `;
  if (!row) return { ok: false as const, reason: "unknown_envelope" };
  await db`
    update sign_envelopes
    set status = ${status}, updated_at = now(),
        completed_at = case when ${status} = 'completed' then now() else completed_at end
    where id = ${asStr(row.id)}
  `;
  if (!shouldImportSignedPdf(status)) return { ok: true as const, status };
  const pdf = await downloadSignedPdf(envelopeId);
  const staffId = row.staff_contract_id ? asStr(row.staff_contract_id) : "";
  const contractId = row.contract_id ? asStr(row.contract_id) : "";
  if (pdf && staffId) {
    const stored = await putFile(pdf.toString("base64"), `hv-signiert-${staffId}.pdf`);
    const fileId = nid();
    await db`
      insert into staff_contract_files (id, staff_contract_id, kind, filename, mime, path)
      values (${fileId}, ${staffId}, ${"signed_pdf"}, ${stored.path.split("/").pop() || "hv.pdf"}, ${"application/pdf"}, ${stored.path})
    `;
    await db`update sign_envelopes set signed_file_id = ${fileId} where id = ${asStr(row.id)}`;
    await db`
      update staff_contracts
      set signed_at = now(),
          signed_channel = 'email',
          signed_by_agent = true,
          signed_by_company = true,
          signed_pdf_path = ${stored.path}
      where id = ${staffId}
    `;
    const [sc] = await db<{ user_id: string | null }>`select user_id from staff_contracts where id = ${staffId}`;
    if (sc?.user_id) {
      await notify(db, {
        userId: sc.user_id,
        type: "signature",
        title: "Handelsvertretervertrag unterschrieben",
        message: "Der Vertrag ist per DocuSign unterschrieben und in der Datenbank gespeichert.",
        link: "/portal/admin/vertraege",
      });
    }
    return { ok: true as const, status: "completed" as SignStatus };
  }
  if (pdf && contractId) {
    const stored = await putFile(pdf.toString("base64"), `vertrag-signiert-${contractId}.pdf`);
    const fileId = nid();
    await db`
      insert into contract_files (id, contract_id, kind, filename, mime, path)
      values (${fileId}, ${contractId}, ${"signed_pdf"}, ${stored.path.split("/").pop() || "vertrag.pdf"}, ${"application/pdf"}, ${stored.path})
    `;
    await db`update sign_envelopes set signed_file_id = ${fileId} where id = ${asStr(row.id)}`;
  }
  if (contractId) {
    await db`
    update contracts set signature_confirmed = true, updated_at = now()
    where id = ${contractId}
  `;
    const [c] = await db<{ user_id: string }>`select user_id from contracts where id = ${contractId}`;
    if (c?.user_id) {
      await notify(db, {
        userId: c.user_id,
        type: "signature",
        title: "Vertrag unterschrieben",
        message: "Der Kunde hat per DocuSign unterschrieben. Das PDF liegt im Auftrag.",
        link: `/portal/auftraege/${contractId}`,
      });
    }
  }
  return { ok: true as const, status: "completed" as SignStatus };
}

export function contractPdfFor(row: {
  first: string;
  last: string;
  street: string;
  house: string;
  zip: string;
  city: string;
  email: string;
  phone: string;
  product: string;
  kwh: string;
  advisor: string;
  art?: VertragArt;
  birth?: string;
  meter?: string;
  previous?: string;
  start?: string;
  iban?: string;
  owner?: string;
  arbeitspreis?: string;
  grundpreis?: string;
  lieferant?: string;
}) {
  return buildPagedPdf(
    fillVertrag({
      art: row.art === "gas" ? "gas" : "strom",
      first: row.first,
      last: row.last,
      street: row.street,
      house: row.house,
      zip: row.zip,
      city: row.city,
      email: row.email,
      phone: row.phone,
      birth: row.birth,
      product: row.product,
      kwh: row.kwh,
      meter: row.meter,
      previous: row.previous,
      start: row.start,
      advisor: row.advisor,
      iban: row.iban,
      owner: row.owner,
      arbeitspreis: row.arbeitspreis,
      grundpreis: row.grundpreis,
      lieferant: row.lieferant,
    }),
  );
}
