import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  can,
  canChangeStatus,
  canSeeAgency,
  STATUS_LABELS,
  type ContractStatus,
  type Role,
} from "@/lib/e1";
import {
  AUTH_STATES,
  DEFAULT_IDENTITIES,
  DMARC_POLICIES,
  MAIL_DOMAIN,
  MAIL_PROVIDER,
  denySendReason,
  dnsRecordsFor,
  isCompanySender,
  isRequiredLocalPart,
  isValidLocalPart,
  mailAddress,
  mailboxTypeFor,
  mailReady,
  normalizeLocalPart,
  workspaceLocalPart,
  type AuthState,
  type DmarcPolicy,
  type MailIdentityKind,
  type MailboxType,
  type WorkspaceAccountStatus,
} from "@/lib/mail";
import { asStr, nid, num } from "@/lib/utils";
import { vatOn } from "@/lib/steuer";
import {
  assertCanSeeUser,
  audit,
  flagsMap,
  loadProfile,
  mapProfile,
  notify,
  requireProfile,
  splitName,
  sql,
  visibleUserIds,
} from "./helpers";

export type ContractDraft = {
  salutation?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  email?: string;
  phone: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  tariffId: string;
  consumptionKwh: number;
  meterNumber?: string;
  previousProvider?: string;
  startDate?: string;
  notes?: string;
  newsalesRef?: string;
  inNewsales?: boolean;
  forStaffId?: string;
  iban?: string;
  bankOwner?: string;
  sepaConfirmed?: boolean;
  privacyConfirmed?: boolean;
  signatureData?: string;
  fullFlow?: boolean;
  scanBase64?: string;
  scanName?: string;
  parked?: boolean;
  title?: string;
  landline?: string;
  mobile?: string;
  bic?: string;
  bankName?: string;
  blz?: string;
  accountNo?: string;
  deliveryKind?: "wechsel" | "neueinzug";
  meloId?: string;
  maloId?: string;
  gridOperator?: string;
  previousCustomerNo?: string;
  oldContractEnd?: string;
  signedAt?: string;
  digitalSignWanted?: boolean;
  earlyDelivery?: boolean;
  invoiceByPost?: boolean;
  differentBilling?: boolean;
};

function monthStart() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
export const bootstrapMe = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const [authUser] = await db`
      select id, name, email from "user" where id = ${context.userId}
    `;
  const { first, last } = splitName(authUser?.name || authUser?.email || "E1 Mitglied");
  let profile = await loadProfile(db, context.userId);
  if (!profile) {
    const admins = await db`
        select count(*)::int as c from profiles where role = 'super_admin' and is_demo = false
      `;
    const isFirst = num(admins[0]?.c) === 0;
    await db`
        insert into profiles (
          user_id, first_name, last_name, role, status, onboarding_status, region_id, monthly_target
        ) values (
          ${context.userId},
          ${first},
          ${last},
          ${isFirst ? "super_admin" : "vertrieb"},
          ${isFirst ? "active" : "pending"},
          ${isFirst ? "aktiv" : "neu"},
          ${isFirst ? "reg-sued" : null},
          ${isFirst ? 12 : 8}
        )
      `;
    profile = await requireProfile(db, context.userId);
    await audit(db, {
      userId: context.userId,
      action: isFirst ? "first_admin_bootstrap" : "self_register",
      entityType: "profile",
      entityId: context.userId,
      newValues: { role: profile.role }
    });
    await notify(db, {
      userId: context.userId,
      type: "system",
      title: isFirst ? "Willkommen, Super-Admin" : "Registrierung eingegangen",
      message: isFirst ? "Sie steuern E1 Direktvertrieb." : "Ihr Zugang wartet auf Freigabe durch einen Super-Admin.",
      link: "/portal"
    });
    try {
      const { provisionUserMailbox } = await import("./workspace.server");
      if (isFirst) {
        await provisionUserMailbox(db, {
          first: profile.first_name,
          last: profile.last_name,
          profileUserId: context.userId,
          orgUnit: "/Geschaeftsfuehrung",
        });
      }
    } catch {
      /* Workspace-Jobs sind best effort */
    }
  }
  await db`update profiles set last_login = now() where user_id = ${context.userId}`;
  const flags = await flagsMap(db, profile);
  const unread = await db`
      select count(*)::int as c from notifications where user_id = ${context.userId} and read = false
    `;
  let mailUnread = 0;
  try {
    const { boxesFor, unreadCountFor } = await import("./mailbox.server");
    const boxes = await boxesFor(db, profile);
    mailUnread = await unreadCountFor(db, boxes);
  } catch {
    mailUnread = 0;
  }
  let require2fa = profile.role === "super_admin";
  try {
    const [row] = await db<{ value: string }>`select value from settings where key = 'require_2fa'`;
    const mode = row?.value || "admins";
    require2fa = mode === "all" || (mode === "admins" && (profile.role === "super_admin" || profile.role === "backoffice"));
  } catch {
    require2fa = profile.role === "super_admin";
  }
  return {
    profile: {
      ...profile,
      email: authUser?.email ?? profile.email
    },
    flags,
    unread: num(unread[0]?.c),
    mailUnread,
    require_2fa: false,
  };
});
export const getMe = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const profile = await loadProfile(db, context.userId);
  return {
    profile,
    flags: await flagsMap(db, profile)
  };
});
export const updateMyProfile = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  await db`
      update profiles
      set first_name = ${data.firstName.trim()},
          last_name = ${data.lastName.trim()},
          phone = ${data.phone?.trim() || null}
      where user_id = ${context.userId}
    `;
  return loadProfile(db, context.userId);
});
export const beginTotp = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const { generateTotpSecret } = await import("@/lib/totp.server");
  const db = await sql();
  const secret = generateTotpSecret();
  await db`update profiles set totp_secret = ${secret} where user_id = ${context.userId}`;
  const [u] = await db`select email from "user" where id = ${context.userId}`;
  return {
    secret,
    uri: `otpauth://totp/E1%20Direktvertrieb:${encodeURIComponent(u?.email || "e1")}?secret=${secret}&issuer=E1%20Direktvertrieb&digits=6&period=30`
  };
});
export const confirmTotp = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((code) => code).handler(async ({ context, data: code }) => {
  const { verifyTotp } = await import("@/lib/totp.server");
  const db = await sql();
  const [row] = await db`
      select totp_secret from profiles where user_id = ${context.userId}
    `;
  if (!row?.totp_secret || !verifyTotp(row.totp_secret, code)) throw new Error("Ungültiger Code. Bitte erneut versuchen.");
  await db`update profiles set totp_enabled = true where user_id = ${context.userId}`;
  await audit(db, {
    userId: context.userId,
    action: "totp_enabled",
    entityType: "profile",
    entityId: context.userId
  });
  return { ok: true };
});
export const checkTotp = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((code) => code).handler(async ({ context, data: code }) => {
  const { verifyTotp } = await import("@/lib/totp.server");
  const [row] = await (await sql())`
      select totp_secret, totp_enabled from profiles where user_id = ${context.userId}
    `;
  if (!row?.totp_enabled) return { ok: true };
  if (!row.totp_secret || !verifyTotp(row.totp_secret, code)) throw new Error("Ungültiger Code.");
  return { ok: true };
});
export const listTariffs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { q?: string; provider?: string; type?: string } = {}) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await loadProfile(db, context.userId);
    const flags = await flagsMap(db, me);
    const allowE1 = Boolean(flags.phase2_own_tariffs);
    const q = data.q?.trim().toLowerCase() || "";
    const provider = data.provider?.trim() || "";
    const type = data.type?.trim() || "";
    const rows = await db<Record<string, unknown>>`
      select id, provider, name, external_id, type
      from tariffs
      where active = true
        and (${allowE1} or provider <> 'E1')
        and (${provider} = '' or provider = ${provider})
        and (${type} = '' or type = ${type})
        and (
          ${q} = ''
          or lower(name) like ${"%" + q + "%"}
          or lower(provider) like ${"%" + q + "%"}
          or external_id like ${"%" + q + "%"}
        )
      order by provider, name
      limit 80
    `;
    const providers = await db<{ provider: string }>`
      select distinct provider from tariffs
      where active = true and (${allowE1} or provider <> 'E1')
      order by provider
    `;
    return {
      providers: providers.map((p) => asStr(p.provider)),
      items: rows.map((r) => ({
        id: asStr(r.id),
        provider: asStr(r.provider),
        name: asStr(r.name),
        external_id: asStr(r.external_id),
        type: asStr(r.type),
      })),
    };
  });

export const quoteCommission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { tariffId: string; consumptionKwh: number; stufe?: number }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const { clampStufe, splitDeal } = await import("@/lib/tariffs");
    const stufe = clampStufe(data.stufe ?? me.commission_stufe);
    const [tariff] = await db<Record<string, unknown>>`
      select * from tariffs where id = ${data.tariffId} and active = true
    `;
    if (!tariff) throw new Error("Tarif nicht gefunden.");
    const bands = await db<Record<string, unknown>>`
      select stufe, kwh_from, kwh_to, amount_eur, amount_ct_kwh
      from tariff_bands where tariff_id = ${data.tariffId} order by stufe, kwh_from
    `;
    const parsed = bands.map((b) => ({
      stufe: num(b.stufe),
      kwh_from: num(b.kwh_from),
      kwh_to: num(b.kwh_to),
      amount_eur: num(b.amount_eur),
      amount_ct_kwh: num(b.amount_ct_kwh),
    }));
    const kwh = Number(data.consumptionKwh) || 0;
    const split = splitDeal(parsed, stufe, kwh);
    if (!split.ok) {
      return {
        ok: false as const,
        tariff: { id: asStr(tariff.id), provider: asStr(tariff.provider), name: asStr(tariff.name), type: asStr(tariff.type), external_id: asStr(tariff.external_id) },
        stufe,
        kwh,
        amount: 0,
        agency: 0,
        advisor: 0,
        margin: 0,
        reason: "Verbrauch liegt in keinem Band dieses Tarifs für Ihre Stufe.",
        bands: parsed,
      };
    }
    return {
      ok: true as const,
      tariff: { id: asStr(tariff.id), provider: asStr(tariff.provider), name: asStr(tariff.name), type: asStr(tariff.type), external_id: asStr(tariff.external_id) },
      stufe,
      kwh,
      amount: split.advisor,
      agency: split.agency,
      advisor: split.advisor,
      margin: split.margin,
      band: parsed.find((b) => b.stufe === stufe),
      bands: parsed,
    };
  });

export const findDuplicates = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ data }) => {
  const last = String(data.lastName || "").trim().toLowerCase();
  if (!last) return [];
  return (await (await sql())`
      select id, first_name, last_name, street, house_number, zip, city, birth_date, phone
      from customers
      where lower(last_name) = ${last}
      order by created_at desc
      limit 8
    `).map((r) => ({
    id: asStr(r.id),
    first_name: asStr(r.first_name),
    last_name: asStr(r.last_name),
    street: asStr(r.street),
    house_number: asStr(r.house_number),
    zip: asStr(r.zip),
    city: asStr(r.city),
    birth_date: r.birth_date ? asStr(r.birth_date) : null,
    phone: r.phone ? asStr(r.phone) : null
  }));
});
export const createContract = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d: ContractDraft) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (me.status !== "active") throw new Error("Ihr Zugang ist noch nicht freigeschaltet.");
  if (!data.firstName?.trim() || !data.lastName?.trim()) throw new Error("Name ist Pflicht.");
  const phoneOrMobile = (data.mobile || data.landline || data.phone || "").trim();
  if (!phoneOrMobile) throw new Error("Telefon oder Mobilnummer ist Pflicht.");
  if (!data.street?.trim() || !data.houseNumber?.trim() || !data.zip?.trim() || !data.city?.trim()) {
    throw new Error("Adresse ist Pflicht — so füllen wir die Kundendatenbank.");
  }
  if (data.inNewsales === false) {
    const fl = await flagsMap(db, me);
    if (!fl.full_contract && !fl.phase2_own_tariffs) {
      throw new Error("Bitte den Vertrag zuerst in New Sales eingeben, danach hier nachpflegen.");
    }
  }
  if (!data.tariffId) throw new Error("Tarif ist Pflicht.");
  const kwh = Number(data.consumptionKwh) || 0;
  if (kwh <= 0) throw new Error("Jahresverbrauch fehlt.");
  let ownerId = context.userId;
  let stufeOwner = me;
  if (data.forStaffId?.trim()) {
    if (!can(me.role, "team.view") && !can(me.role, "users.manage")) {
      throw new Error("Nur Leitung darf auf eine andere Mitarbeiter-ID buchen.");
    }
    const key = data.forStaffId.trim().toLowerCase();
    const [owner] = await db<Record<string, unknown>>`
      select user_id, staff_id, first_name, last_name, commission_stufe, status, role
      from profiles
      where lower(coalesce(staff_id, '')) = ${key} or user_id = ${data.forStaffId.trim()}
    `;
    if (!owner) throw new Error("Mitarbeiter-ID unbekannt.");
    await assertCanSeeUser(db, me, asStr(owner.user_id));
    ownerId = asStr(owner.user_id);
    stufeOwner = mapProfile(owner);
  }
  const { clampStufe, splitDeal } = await import("@/lib/tariffs");
  const stufe = clampStufe(stufeOwner.commission_stufe);
  const [tariff] = await db<Record<string, unknown>>`
      select * from tariffs where id = ${data.tariffId} and active = true
    `;
  if (!tariff) throw new Error("Tarif nicht gefunden.");
  const bands = (await db<Record<string, unknown>>`
      select stufe, kwh_from, kwh_to, amount_eur, amount_ct_kwh
      from tariff_bands where tariff_id = ${data.tariffId}
    `).map((b) => ({
    stufe: num(b.stufe),
    kwh_from: num(b.kwh_from),
    kwh_to: num(b.kwh_to),
    amount_eur: num(b.amount_eur),
    amount_ct_kwh: num(b.amount_ct_kwh),
  }));
  const split = splitDeal(bands, stufe, kwh);
  if (!split.ok) throw new Error("Verbrauch liegt in keinem Band dieses Tarifs für Ihre Stufe.");
  const amount = split.advisor;
  const type = asStr(tariff.type);
  const customerId = nid();
  await db`
      insert into customers (
        id, salutation, first_name, last_name, birth_date, email, phone,
        street, house_number, zip, city, consents
      ) values (
        ${customerId},
        ${data.salutation?.trim() || null},
        ${data.firstName.trim()},
        ${data.lastName.trim()},
        ${data.birthDate || null},
        ${data.email?.trim() || null},
        ${phoneOrMobile},
        ${data.street.trim()},
        ${data.houseNumber.trim()},
        ${data.zip.trim()},
        ${data.city.trim()},
        ${JSON.stringify({
          capture: data.fullFlow ? "e1_full" : "newsales_then_portal",
          at: new Date().toISOString(),
        })}::jsonb
      )
    `;
  const id = nid();
  const ref = data.newsalesRef?.trim() || null;
  const full = Boolean(data.fullFlow);
  const parked = data.parked !== false;
  const { optionalIban } = await import("@/lib/iban");
  const iban = optionalIban(data.iban);
  if (full && !data.privacyConfirmed) {
    throw new Error("Datenschutz muss beim eigenen E1-Vertrag bestätigt sein.");
  }
  if (iban && full && !data.sepaConfirmed) {
    throw new Error("SEPA muss bestätigt sein, wenn eine IBAN angegeben ist.");
  }
  const status = parked || full ? "erfasst" : "uebermittelt";
  const intake = {
    title: data.title || "",
    landline: data.landline || "",
    mobile: data.mobile || "",
    bic: data.bic || "",
    bankName: data.bankName || "",
    blz: data.blz || "",
    accountNo: data.accountNo || "",
    meloId: data.meloId || "",
    maloId: data.maloId || "",
    gridOperator: data.gridOperator || "",
    previousCustomerNo: data.previousCustomerNo || "",
    oldContractEnd: data.oldContractEnd || "",
    digitalSignWanted: Boolean(data.digitalSignWanted),
    earlyDelivery: Boolean(data.earlyDelivery),
    invoiceByPost: Boolean(data.invoiceByPost),
    differentBilling: Boolean(data.differentBilling),
    parked: true,
  };
  await db`
      insert into contracts (
        id, customer_id, user_id, type, tariff_id, status, consumption_kwh, meter_number,
        previous_provider, start_date, commission_rate, commission_amount, commission_stufe,
        agency_amount, advisor_amount, margin_amount,
        sepa_confirmed, privacy_confirmed, signature_confirmed, notes, newsales_ref, source,
        bank_iban, bank_owner, intake, bank_bic, signed_at, delivery_kind
      ) values (
        ${id}, ${customerId}, ${ownerId}, ${type}, ${data.tariffId}, ${status},
        ${kwh}, ${data.meterNumber?.trim() || null}, ${data.previousProvider?.trim() || null},
        ${data.startDate || null}, ${amount}, ${amount}, ${stufe},
        ${split.agency}, ${split.advisor}, ${split.margin},
        ${Boolean(data.sepaConfirmed)}, ${Boolean(data.privacyConfirmed)}, ${Boolean(data.signatureData)},
        ${data.notes?.trim() || null}, ${ref}, ${full ? "e1_direct" : parked ? "geparkt" : "newsales_manual"},
        ${iban || null}, ${data.bankOwner?.trim() || null},
        ${JSON.stringify(intake)}::jsonb, ${data.bic?.trim() || null}, ${data.signedAt || null},
        ${data.deliveryKind || "wechsel"}
      )
    `;
  await db`
      insert into status_history (id, contract_id, old_status, new_status, changed_by, comment)
      values (
        ${nid()}, ${id}, null, ${status}, ${context.userId},
        ${`${parked ? "Geparkt" : "Gebucht"} auf ${ownerId === context.userId ? "eigene ID" : stufeOwner.first_name + " " + stufeOwner.last_name} · ${asStr(tariff.provider)} ${asStr(tariff.name)} · Stufe ${stufe} · Berater ${split.advisor} € · Agentur ${split.agency} € · Marge ${split.margin} €${iban ? "" : " · ohne IBAN"}`}
      )
    `;
  await audit(db, {
    userId: context.userId,
    action: "contract.create",
    entityType: "contract",
    entityId: id,
    newValues: {
      type,
      tariff: asStr(tariff.name),
      stufe,
      amount,
      customerId,
      ownerId,
    }
  });
  if (ownerId !== context.userId) {
    await notify(db, {
      userId: ownerId,
      type: "auftrag",
      title: "Abschluss auf Ihre ID",
      message: `${me.first_name} ${me.last_name} hat ${data.firstName} ${data.lastName} auf Ihre Mitarbeiter-ID gebucht · ${asStr(tariff.name)} (${amount.toFixed(2)} €).`,
      link: `/portal/auftraege/${id}`,
    });
  }
  if (me.supervisor_id) await notify(db, {
    userId: me.supervisor_id,
    type: "auftrag",
    title: "Neuer Eintrag im Team",
    message: `${me.first_name} ${me.last_name} hat ${data.firstName} ${data.lastName} in die Datenbank gesetzt · ${asStr(tariff.name)} (${amount.toFixed(2)} €).`,
    link: `/portal/auftraege/${id}`
  });
  try {
    const { runGoalNudges } = await import("./goal-nudge.server");
    await runGoalNudges(db, ownerId);
  } catch {
    /* Ziel-Push optional */
  }
  if (!full && !parked) {
    try {
      const { newsalesConfigured, submitNewsalesOrder } = await import("./newsales.server");
      if (newsalesConfigured()) {
        const pushed = await submitNewsalesOrder({
          portalId: id,
          advisorId: ownerId,
          advisorName: `${stufeOwner.first_name} ${stufeOwner.last_name}`.trim(),
          customer: {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            phone: phoneOrMobile,
            email: data.email?.trim(),
            street: data.street.trim(),
            houseNumber: data.houseNumber.trim(),
            zip: data.zip.trim(),
            city: data.city.trim(),
            birthDate: data.birthDate,
          },
          productName: asStr(tariff.name),
          provider: asStr(tariff.provider),
          type,
          consumptionKwh: kwh,
          meterNumber: data.meterNumber?.trim(),
          previousProvider: data.previousProvider?.trim(),
          startDate: data.startDate,
          notes: data.notes?.trim(),
          iban,
          bankOwner: data.bankOwner?.trim(),
        });
        if (pushed.ok && pushed.ref) {
          await db`
            update contracts
            set newsales_ref = ${pushed.ref}, source = 'newsales_api', updated_at = now()
            where id = ${id}
          `;
        }
      }
    } catch {
      /* New Sales API optional — Portal-Eintrag bleibt */
    }
  }
  try {
    const { createHandover, putFile } = await import("./ops.server");
    if (!full && !parked) await createHandover(db, id, context.userId);
    if (data.scanBase64) {
      const stored = await putFile(data.scanBase64, data.scanName || "vertrag.pdf");
      await db`
        insert into documents (id, contract_id, type, file_path, uploaded_by)
        values (${nid()}, ${id}, ${"vertrag_scan"}, ${stored.path}, ${context.userId})
      `;
    }
    if (data.signatureData) {
      await db`
        insert into documents (id, contract_id, type, file_path, uploaded_by)
        values (${nid()}, ${id}, ${"unterschrift"}, ${data.signatureData}, ${context.userId})
      `;
    }
  } catch {
    /* Handover/Scan optional */
  }
  return { id, amount, stufe, agency: split.agency, advisor: split.advisor, margin: split.margin, ibanMissing: !iban };
});
export const listContracts = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d = {}) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  const ids = data.scope === "mine" ? [me.user_id] : await visibleUserIds(db, me);
  const params = [];
  let where = "where coalesce(pr.is_demo,false) = false";
  if (ids) {
    params.push(ids);
    where += ` and c.user_id = any($${params.length})`;
  }
  if (data.status) {
    params.push(data.status);
    where += ` and c.status = $${params.length}`;
  }
  if (data.type) {
    params.push(data.type);
    where += ` and c.type = $${params.length}`;
  }
  if (data.q?.trim()) {
    params.push(`%${data.q.trim().toLowerCase()}%`);
    where += ` and (lower(cu.last_name) like $${params.length} or lower(cu.first_name) like $${params.length} or lower(cu.city) like $${params.length} or c.meter_number like $${params.length} or c.id like $${params.length})`;
  }
  return (await db.query(`select c.*, cu.first_name, cu.last_name, cu.city, cu.zip, cu.phone,
              coalesce(t.name, p.name) as product_name, coalesce(t.provider, p.provider) as provider,
              pr.first_name as advisor_first, pr.last_name as advisor_last
       from contracts c
       join customers cu on cu.id = c.customer_id
       left join products p on p.id = c.product_id
       left join tariffs t on t.id = c.tariff_id
       left join profiles pr on pr.user_id = c.user_id
       ${where}
       order by c.created_at desc
       limit 400`, params)).map((r) => ({
    id: asStr(r.id),
    customer_id: asStr(r.customer_id),
    user_id: asStr(r.user_id),
    type: asStr(r.type),
    product_id: asStr(r.product_id),
    product_name: asStr(r.product_name),
    status: asStr(r.status),
    consumption_kwh: num(r.consumption_kwh),
    meter_number: r.meter_number ? asStr(r.meter_number) : "",
    start_date: r.start_date ? asStr(r.start_date) : null,
    city: asStr(r.city),
    zip: asStr(r.zip),
    phone: asStr(r.phone),
    customer_name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
    advisor_name: `${asStr(r.advisor_first)} ${asStr(r.advisor_last)}`.trim(),
    commission_amount: num(r.commission_amount),
    created_at: asStr(r.created_at),
    notes: r.notes ? asStr(r.notes) : "",
    cancel_reason: r.cancel_reason ? asStr(r.cancel_reason) : ""
  }));
});
export const getContract = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((id) => id).handler(async ({ context, data: id }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  const [row] = await db`
      select c.*, cu.salutation, cu.first_name, cu.last_name, cu.birth_date, cu.email, cu.phone,
             cu.street, cu.house_number, cu.zip, cu.city, cu.consents,
             coalesce(t.name, p.name) as product_name, coalesce(t.provider, p.provider) as provider,
             p.base_price, p.work_price, t.external_id as tariff_external_id,
             pr.first_name as advisor_first, pr.last_name as advisor_last
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join products p on p.id = c.product_id
      left join tariffs t on t.id = c.tariff_id
      left join profiles pr on pr.user_id = c.user_id
      where c.id = ${id}
    `;
  if (!row) throw new Error("Auftrag nicht gefunden");
  await assertCanSeeUser(db, me, asStr(row.user_id));
  const history = await db`
      select h.*, pr.first_name, pr.last_name
      from status_history h
      left join profiles pr on pr.user_id = h.changed_by
      where h.contract_id = ${id}
      order by h.changed_at asc
    `;
  const docs = await db`
      select id, type, uploaded_at, uploaded_by, file_path
      from documents where contract_id = ${id} order by uploaded_at
    `;
  const comms = await db`
      select * from commissions where contract_id = ${id} order by calculated_at
    `;
  let handover: { id: string; recipient: string; status: string; created_at: string; package_text: string } | null = null;
  try {
    const [h] = await db<Record<string, unknown>>`
      select * from handovers where contract_id = ${id} order by created_at desc limit 1
    `;
    if (h) {
      handover = {
        id: asStr(h.id),
        recipient: asStr(h.recipient),
        status: asStr(h.status),
        created_at: asStr(h.created_at),
        package_text: asStr(h.package_text),
      };
    }
  } catch {
    handover = null;
  }
  return {
    contract: {
      id: asStr(row.id),
      customer_id: asStr(row.customer_id),
      user_id: asStr(row.user_id),
      type: asStr(row.type),
      product_id: asStr(row.product_id),
      product_name: asStr(row.product_name),
      provider: asStr(row.provider),
      tariff_id: row.tariff_id ? asStr(row.tariff_id) : "",
      tariff_external_id: row.tariff_external_id ? asStr(row.tariff_external_id) : "",
      commission_stufe: num(row.commission_stufe) || 1,
      newsales_ref: row.newsales_ref ? asStr(row.newsales_ref) : "",
      source: row.source ? asStr(row.source) : "newsales_manual",
      status: asStr(row.status),
      consumption_kwh: num(row.consumption_kwh),
      meter_number: asStr(row.meter_number),
      previous_provider: asStr(row.previous_provider),
      start_date: row.start_date ? asStr(row.start_date) : null,
      bank_iban: asStr(row.bank_iban),
      bank_owner: asStr(row.bank_owner),
      commission_amount: num(row.commission_amount),
      agency_amount: canSeeAgency(me.role) ? num(row.agency_amount) || num(row.commission_amount) : num(row.advisor_amount) || num(row.commission_amount),
      advisor_amount: num(row.advisor_amount) || num(row.commission_amount),
      margin_amount: canSeeAgency(me.role) ? num(row.margin_amount) : 0,
      show_split: canSeeAgency(me.role),
      sepa_confirmed: Boolean(row.sepa_confirmed),
      privacy_confirmed: Boolean(row.privacy_confirmed),
      signature_confirmed: Boolean(row.signature_confirmed),
      notes: asStr(row.notes),
      cancel_reason: asStr(row.cancel_reason),
      created_at: asStr(row.created_at),
      base_price: num(row.base_price),
      work_price: num(row.work_price),
      customer: {
        salutation: asStr(row.salutation),
        first_name: asStr(row.first_name),
        last_name: asStr(row.last_name),
        birth_date: row.birth_date ? asStr(row.birth_date) : null,
        email: asStr(row.email),
        phone: asStr(row.phone),
        street: asStr(row.street),
        house_number: asStr(row.house_number),
        zip: asStr(row.zip),
        city: asStr(row.city)
      },
      advisor_name: `${asStr(row.advisor_first)} ${asStr(row.advisor_last)}`.trim()
    },
    history: history.map((h) => ({
      id: asStr(h.id),
      old_status: h.old_status ? asStr(h.old_status) : null,
      new_status: asStr(h.new_status),
      comment: asStr(h.comment),
      changed_at: asStr(h.changed_at),
      by: `${asStr(h.first_name)} ${asStr(h.last_name)}`.trim()
    })),
    documents: docs.map((d) => ({
      id: asStr(d.id),
      type: asStr(d.type),
      file_path: asStr(d.file_path),
      uploaded_at: asStr(d.uploaded_at)
    })),
    commissions: comms.map((c) => ({
      id: asStr(c.id),
      amount: num(c.amount),
      type: asStr(c.type),
      status: asStr(c.status),
      calculated_at: asStr(c.calculated_at)
    })),
    handover,
  };
});
export const changeStatus = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  const [row] = await db`select * from contracts where id = ${data.id}`;
  if (!row) throw new Error("Auftrag nicht gefunden");
  await assertCanSeeUser(db, me, asStr(row.user_id));
  const from = asStr(row.status);
  if (!canChangeStatus(me.role, from, data.to)) throw new Error("Dieser Statuswechsel ist für Ihre Rolle nicht erlaubt.");
  if (data.to === "storniert" && !data.cancelReason) throw new Error("Storno braucht einen Grund.");
  await db`
      update contracts
      set status = ${data.to},
          cancel_reason = ${data.to === "storniert" ? data.cancelReason || null : null},
          updated_at = now()
      where id = ${data.id}
    `;
  await db`
      insert into status_history (id, contract_id, old_status, new_status, changed_by, comment)
      values (${nid()}, ${data.id}, ${from}, ${data.to}, ${context.userId}, ${data.comment || data.cancelReason || null})
    `;
  if (data.to === "bestaetigt" || data.to === "beliefert") {
    if (!(await db`
        select id from commissions where contract_id = ${data.id} and type = 'abschluss'
      `)[0]) {
      const amount = num(row.commission_amount);
      await db`
          insert into commissions (id, contract_id, user_id, amount, type, status)
          values (${nid()}, ${data.id}, ${asStr(row.user_id)}, ${amount}, 'abschluss', 'offen')
        `;
      if ((await flagsMap(db, me)).structure_commissions) {
        const [advisor] = await db`
            select supervisor_id from profiles where user_id = ${asStr(row.user_id)}
          `;
        if (advisor?.supervisor_id) await db`
              insert into commissions (id, contract_id, user_id, amount, type, status, note)
              values (${nid()}, ${data.id}, ${advisor.supervisor_id}, ${Math.round(amount * .2 * 100) / 100}, 'struktur', 'offen', 'Struktur 20%')
            `;
      }
      await notify(db, {
        userId: asStr(row.user_id),
        type: "provision",
        title: "Provision berechnet",
        message: `Auftrag bestätigt – Provision ${amount.toFixed(2)} € ist offen.`,
        link: "/portal/provisionen"
      });
    }
  }
  try {
    const { ensureLaterCommissions, createHandover, evaluateQuality } = await import("./ops.server");
    await ensureLaterCommissions(db, data.id, data.to);
    if (data.to === "uebermittelt" && asStr(row.source) !== "newsales_manual") {
      await createHandover(db, data.id, context.userId);
    }
    if (data.to === "storniert") {
      await evaluateQuality(db, asStr(row.user_id));
    }
  } catch {
    /* ops tables after migration */
  }
  if (data.to === "storniert") {
    await db`
        update commissions set status = 'storniert'
        where contract_id = ${data.id} and type in ('abschluss','struktur','folge','bestand') and status in ('offen','freigegeben')
      `;
    const [win] = await db<{ value: string }>`select value from settings where key = 'storno_window_days'`;
    const days = Math.max(1, Number(win?.value) || 14);
    const created = new Date(asStr(row.created_at)).getTime();
    const within = Number.isFinite(created) && Date.now() - created <= days * 86400000;
    if (within) {
      await db`
          insert into commissions (id, contract_id, user_id, amount, type, status, note)
          values (${nid()}, ${data.id}, ${asStr(row.user_id)}, ${-Math.abs(num(row.commission_amount))}, 'storno', 'storniert', ${data.cancelReason || "Widerruf 14 Tage"})
        `;
    }
  }
  await notify(db, {
    userId: asStr(row.user_id),
    type: "status",
    title: `Status: ${STATUS_LABELS[data.to]}`,
    message: data.comment || data.cancelReason || `Auftrag wurde auf ${STATUS_LABELS[data.to]} gesetzt.`,
    link: `/portal/auftraege/${data.id}`
  });
  await audit(db, {
    userId: context.userId,
    action: "contract.status",
    entityType: "contract",
    entityId: data.id,
    oldValues: { status: from },
    newValues: {
      status: data.to,
      reason: data.cancelReason
    }
  });
  return { ok: true };
});
export const updateContractNotes = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  const [row] = await db`select user_id from contracts where id = ${data.id}`;
  if (!row) throw new Error("Auftrag nicht gefunden");
  await assertCanSeeUser(db, me, row.user_id);
  await db`
      update contracts
      set notes = ${data.notes ?? null},
          meter_number = coalesce(${data.meterNumber ?? null}, meter_number),
          bank_iban = coalesce(${data.iban ? (await import("@/lib/iban")).optionalIban(data.iban) : null}, bank_iban),
          bank_owner = coalesce(${data.bankOwner ?? null}, bank_owner),
          sepa_confirmed = case when ${Boolean(data.sepaConfirmed)} then true else sepa_confirmed end,
          updated_at = now()
      where id = ${data.id}
    `;
  return { ok: true };
});
export const uploadContractFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; base64: string; filename?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [row] = await db<{ user_id: string }>`select user_id from contracts where id = ${data.id}`;
    if (!row) throw new Error("Auftrag nicht gefunden");
    await assertCanSeeUser(db, me, row.user_id);
    if (!data.base64) throw new Error("Datei fehlt");
    const { putFile } = await import("./ops.server");
    const stored = await putFile(data.base64, data.filename || "vertrag.pdf");
    await db`
      insert into documents (id, contract_id, type, file_path, uploaded_by)
      values (${nid()}, ${data.id}, ${"vertrag_scan"}, ${stored.path}, ${context.userId})
    `;
    await audit(db, {
      userId: context.userId,
      action: "contract.upload",
      entityType: "contract",
      entityId: data.id,
    });
    return { ok: true, path: stored.path };
  });
export const listCustomers = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((q = "") => q).handler(async ({ context, data: q }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  const ids = await visibleUserIds(db, me);
  const params = [];
  let where = "where 1=1";
  if (ids) {
    params.push(ids);
    where += ` and c.id in (select customer_id from contracts where user_id = any($${params.length}))`;
  }
  if (q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    where += ` and (lower(c.last_name) like $${params.length} or lower(c.first_name) like $${params.length} or c.zip like $${params.length} or lower(c.city) like $${params.length} or c.phone like $${params.length})`;
  }
  return (await db.query(`select c.*,
              (select count(*) from contracts x where x.customer_id = c.id) as contract_count,
              (select count(*) from contracts x where x.customer_id = c.id and x.type = 'strom' and x.status <> 'storniert') as active_strom
       from customers c ${where}
       order by c.updated_at desc
       limit 300`, params)).map((r) => ({
    id: asStr(r.id),
    first_name: asStr(r.first_name),
    last_name: asStr(r.last_name),
    phone: asStr(r.phone),
    email: asStr(r.email),
    zip: asStr(r.zip),
    city: asStr(r.city),
    street: asStr(r.street),
    house_number: asStr(r.house_number),
    contract_count: num(r.contract_count),
    active_strom: num(r.active_strom)
  }));
});
export const getCustomer = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((id) => id).handler(async ({ context, data: id }) => {
  const db = await sql();
  await requireProfile(db, context.userId);
  const [c] = await db`select * from customers where id = ${id}`;
  if (!c) throw new Error("Kunde nicht gefunden");
  const contracts = await db`
      select c.*, p.name as product_name from contracts c
      left join products p on p.id = c.product_id
      where c.customer_id = ${id}
      order by c.created_at desc
    `;
  return {
    customer: {
      id: asStr(c.id),
      salutation: asStr(c.salutation),
      first_name: asStr(c.first_name),
      last_name: asStr(c.last_name),
      birth_date: c.birth_date ? asStr(c.birth_date) : null,
      email: asStr(c.email),
      phone: asStr(c.phone),
      street: asStr(c.street),
      house_number: asStr(c.house_number),
      zip: asStr(c.zip),
      city: asStr(c.city),
      notes: asStr(c.notes)
    },
    contracts: contracts.map((r) => ({
      id: asStr(r.id),
      type: asStr(r.type),
      status: asStr(r.status),
      product_name: asStr(r.product_name),
      created_at: asStr(r.created_at)
    }))
  };
});
export const gdprEraseCustomer = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((id) => id).handler(async ({ context, data: id }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "customers.delete")) throw new Error("Keine Berechtigung für Löschung.");
  await db`
      update customers set
        first_name = 'Gelöscht',
        last_name = 'Person',
        email = null,
        phone = null,
        street = null,
        house_number = null,
        birth_date = null,
        notes = 'DSGVO-Löschung',
        consents = '{}'::jsonb
      where id = ${id}
    `;
  await db`delete from documents where contract_id in (select id from contracts where customer_id = ${id})`;
  await audit(db, {
    userId: context.userId,
    action: "gdpr.erase",
    entityType: "customer",
    entityId: id
  });
  return { ok: true };
});
export const getDashboard = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  try {
    const { runGoalNudges } = await import("./goal-nudge.server");
    await runGoalNudges(db, context.userId);
  } catch {
    /* Ziel-Push optional */
  }
  const ids = await visibleUserIds(db, me);
  const datePh = ids ? "$2" : "$1";
  const filter = ids ? " and user_id = any($1)" : "";
  const live = ` and user_id in (select user_id from profiles where coalesce(is_demo,false) = false)`;
  const kpis = await db.query(`select
         count(*) filter (where created_at >= ${datePh}::date) as month_count,
         count(*) filter (where status in ('bestaetigt','beliefert','abgerechnet') and created_at >= ${datePh}::date) as month_won,
         count(*) filter (where status = 'storniert') as storno,
         count(*) as total,
         count(*) filter (where status = 'erfasst') as erfasst,
         count(*) filter (where status = 'in_pruefung') as in_pruefung,
         count(*) filter (where status = 'korrektur_noetig') as korrektur_noetig,
         count(*) filter (where status = 'uebermittelt') as uebermittelt,
         count(*) filter (where status = 'bestaetigt') as bestaetigt,
         count(*) filter (where status = 'beliefert') as beliefert,
         count(*) filter (where status = 'abgerechnet') as abgerechnet
       from contracts where 1=1 ${filter}${live}`, ids ? [ids, monthStart()] : [monthStart()]);
  const comm = await db.query(`select
         coalesce(sum(amount) filter (where status = 'offen'),0) as offen,
         coalesce(sum(amount) filter (where status = 'freigegeben'),0) as frei,
         coalesce(sum(amount) filter (where status = 'ausgezahlt'),0) as paid
       from commissions where 1=1 ${ids ? "and user_id = any($1)" : ""} ${live}`, ids ? [ids] : []);
  const ranking = await db.query(`select p.user_id, p.first_name, p.last_name, p.monthly_target,
              count(c.id) filter (where c.status in ('bestaetigt','beliefert','abgerechnet') and c.created_at >= $1::date) as wins
       from profiles p
       left join contracts c on c.user_id = p.user_id
       where p.status = 'active' and coalesce(p.is_demo,false) = false
         and p.role in ('vertrieb','partner','teamleiter','gebietsleiter','super_admin')
       group by p.user_id, p.first_name, p.last_name, p.monthly_target
       order by wins desc, p.last_name
       limit 8`, [monthStart()]);
  const k = kpis[0] || {};
  const cm = comm[0] || {};
  let agencyGross = 0;
  let agencyMargin = 0;
  let agencyAdvisor = 0;
  let agencyFix = 0;
  try {
    const [ag] = await db<{ g: string; m: string; a: string }>`
      select
        coalesce(sum(coalesce(agency_amount, commission_amount)) filter (where status <> 'storniert'),0)::text as g,
        coalesce(sum(coalesce(margin_amount,0)) filter (where status <> 'storniert'),0)::text as m,
        coalesce(sum(coalesce(advisor_amount, commission_amount)) filter (where status <> 'storniert'),0)::text as a
      from contracts
    `;
    agencyGross = num(ag?.g);
    agencyMargin = num(ag?.m);
    agencyAdvisor = num(ag?.a);
    const [fx] = await db<{ v: string }>`
      select coalesce(sum(
        case
          when cadence = 'monat' then amount * 12
          when cadence = 'jahr' then amount
          else amount
        end
      ),0)::text as v
      from tax_expenses
      where scope = 'agency'
        and spent_on >= ${`${new Date().getFullYear()}-01-01`}::date
    `;
    agencyFix = num(fx?.v);
  } catch {
    agencyGross = 0;
  }
  let myTurnover = 0;
  try {
    const [mine] = await db<{ v: string }>`
      select coalesce(sum(coalesce(advisor_amount, commission_amount)) filter (where status <> 'storniert'),0)::text as v
      from contracts
      where user_id = ${me.user_id}
        and created_at >= ${`${new Date().getFullYear()}-01-01`}::date
    `;
    myTurnover = num(mine?.v);
  } catch {
    myTurnover = 0;
  }
  return {
    monthCount: num(k.month_count),
    monthWon: num(k.month_won),
    storno: num(k.storno),
    total: num(k.total),
    pipeline: {
      erfasst: num(k.erfasst),
      in_pruefung: num(k.in_pruefung),
      korrektur_noetig: num(k.korrektur_noetig),
      uebermittelt: num(k.uebermittelt),
      bestaetigt: num(k.bestaetigt),
      beliefert: num(k.beliefert),
      abgerechnet: num(k.abgerechnet)
    },
    commissionOpen: num(cm.offen),
    commissionApproved: num(cm.frei),
    commissionPaid: num(cm.paid),
    myTurnover,
    agencyGross,
    agencyMargin,
    agencyAdvisor,
    agencyFix,
    target: me.monthly_target,
    ranking: ranking.map((r) => ({
      user_id: asStr(r.user_id),
      name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
      wins: num(r.wins),
      target: num(r.monthly_target)
    })),
    me,
    mailUnread: await (async () => {
      try {
        const { boxesFor, unreadCountFor } = await import("./mailbox.server");
        return unreadCountFor(db, await boxesFor(db, me));
      } catch {
        return 0;
      }
    })(),
    mail: can(me.role, "settings.manage")
      ? await (async () => {
          const domain = await ensureMailDomain(db);
          const spf = asAuth(domain.spf_status);
          const dkim = asAuth(domain.dkim_status);
          const dmarc = asAuth(domain.dmarc_status);
          return {
            ready: mailReady(spf, dkim, dmarc),
            spf,
            dkim,
            dmarc,
            block_reason: denySendReason(spf, dkim, dmarc),
          };
        })()
      : null,
  };
});
export const listCommissions = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d = {}) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  const ids = can(me.role, "commissions.approve") || can(me.role, "commissions.pay") ? await visibleUserIds(db, me) : [me.user_id];
  const params = [];
  let where = "where 1=1";
  if (ids) {
    params.push(ids);
    where += ` and cm.user_id = any($${params.length})`;
  }
  if (data.status) {
    params.push(data.status);
    where += ` and cm.status = $${params.length}`;
  }
  return (await db.query(`select cm.*, p.first_name, p.last_name, c.type as energy, pr.name as product_name
       from commissions cm
       join profiles p on p.user_id = cm.user_id
       join contracts c on c.id = cm.contract_id
       left join products pr on pr.id = c.product_id
       ${where}
       order by cm.calculated_at desc
       limit 400`, params)).map((r) => ({
    id: asStr(r.id),
    contract_id: asStr(r.contract_id),
    user_id: asStr(r.user_id),
    advisor: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
    amount: num(r.amount),
    type: asStr(r.type),
    status: asStr(r.status),
    energy: asStr(r.energy),
    product_name: asStr(r.product_name),
    calculated_at: asStr(r.calculated_at),
    paid_at: r.paid_at ? asStr(r.paid_at) : null
  }));
});
export const setCommissionStatus = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (data.status === "ausgezahlt" && !can(me.role, "commissions.pay")) throw new Error("Keine Berechtigung für Auszahlung.");
  if (data.status === "freigegeben" && !can(me.role, "commissions.approve")) throw new Error("Keine Berechtigung für Freigabe.");
  for (const id of data.ids) await db`
        update commissions
        set status = ${data.status},
            paid_at = case when ${data.status} = 'ausgezahlt' then now() else paid_at end
        where id = ${id}
      `;
  await audit(db, {
    userId: context.userId,
    action: `commission.${data.status}`,
    entityType: "commission",
    entityId: data.ids.join(",")
  });
  return { ok: true };
});
export const listNotifications = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  return (await (await sql())`
      select * from notifications where user_id = ${context.userId}
      order by created_at desc limit 80
    `).map((r) => ({
    id: asStr(r.id),
    type: asStr(r.type),
    title: asStr(r.title),
    message: asStr(r.message),
    read: Boolean(r.read),
    link: r.link ? asStr(r.link) : "/portal",
    created_at: asStr(r.created_at)
  }));
});
export const markNotificationsRead = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
  await (await sql())`update notifications set read = true where user_id = ${context.userId}`;
  return { ok: true };
});
export const listArticles = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  return (await (await sql())`
      select a.*, (k.user_id is not null) as done
      from knowledge_articles a
      left join knowledge_progress k on k.article_id = a.id and k.user_id = ${context.userId}
      order by a.required desc, a.title
    `).map((r) => ({
    id: asStr(r.id),
    slug: asStr(r.slug),
    title: asStr(r.title),
    category: asStr(r.category),
    body: asStr(r.body),
    required: Boolean(r.required),
    done: Boolean(r.done)
  }));
});
export const completeArticle = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((id) => id).handler(async ({ context, data: id }) => {
  await (await sql())`
      insert into knowledge_progress (user_id, article_id)
      values (${context.userId}, ${id})
      on conflict do nothing
    `;
  return { ok: true };
});
export const listUsers = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "users.manage") && !can(me.role, "team.view")) throw new Error("Kein Zugriff");
  const ids = can(me.role, "users.manage") ? null : await visibleUserIds(db, me);
  const params = [];
  let where = "where coalesce(p.is_demo,false) = false and p.status <> 'deleted'";
  if (ids) {
    params.push(ids);
    where += ` and p.user_id = any($${params.length})`;
  }
  return (await db.query(`select p.*, r.name as region_name, u.email,
              (select count(*) from contracts c where c.user_id = p.user_id) as orders,
              (select count(*) from contracts c where c.user_id = p.user_id and c.status = 'storniert') as stornos
       from profiles p
       left join regions r on r.id = p.region_id
       left join "user" u on u.id = p.user_id
       ${where}
       order by p.is_demo, p.role, p.last_name`, params)).map((r) => ({
    ...mapProfile(r),
    email: r.email ? asStr(r.email) : null,
    orders: num(r.orders),
    stornos: num(r.stornos),
    invite_code: r.invite_code && !r.totp_enabled ? asStr(r.invite_code) : null,
    staff_id: r.staff_id ? asStr(r.staff_id) : null,
    hv_contract_id: r.hv_contract_id ? asStr(r.hv_contract_id) : null,
    payout_iban: r.payout_iban ? asStr(r.payout_iban) : "",
    payout_name: r.payout_name ? asStr(r.payout_name) : "",
  }));
});
export const listBookableStaff = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "team.view") && !can(me.role, "users.manage") && me.role !== "vertrieb") {
    return [{ user_id: me.user_id, staff_id: null as string | null, name: `${me.first_name} ${me.last_name}`, commission_stufe: me.commission_stufe || 1 }];
  }
  const ids = can(me.role, "users.manage") ? null : await visibleUserIds(db, me);
  const rows = ids
    ? await db<{ user_id: string; staff_id: string | null; first_name: string; last_name: string; commission_stufe: number }>`
        select user_id, staff_id, first_name, last_name, commission_stufe from profiles
        where status = 'active' and is_demo = false and user_id = any(${ids})
        order by last_name, first_name
      `
    : await db<{ user_id: string; staff_id: string | null; first_name: string; last_name: string; commission_stufe: number }>`
        select user_id, staff_id, first_name, last_name, commission_stufe from profiles
        where status = 'active' and is_demo = false
        order by last_name, first_name
      `;
  return rows.map((r) => ({
    user_id: r.user_id,
    staff_id: r.staff_id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    commission_stufe: Number(r.commission_stufe) || 1,
  }));
});
export const listStaffFlags = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Keine Berechtigung.");
    const rows = await db<{ key: string; enabled: boolean }>`
      select key, enabled from profile_flags where user_id = ${data.userId}
    `;
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.key] = Boolean(r.enabled);
    return map;
  });
export const setStaffFlag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; key: string; enabled: boolean }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Keine Berechtigung.");
    await db`
      insert into profile_flags (user_id, key, enabled, updated_at)
      values (${data.userId}, ${data.key}, ${data.enabled}, now())
      on conflict (user_id, key) do update set enabled = ${data.enabled}, updated_at = now()
    `;
    await audit(db, {
      userId: context.userId,
      action: "staff.flag",
      entityType: "profile",
      entityId: data.userId,
      newValues: { key: data.key, enabled: data.enabled },
    });
    return { ok: true };
  });
export const updateUser = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "users.manage") && !can(me.role, "roles.assign")) throw new Error("Keine Berechtigung.");
  const old = await loadProfile(db, data.userId);
  if (!old) throw new Error("Mitarbeiter nicht gefunden.");
  if (data.status === "inactive" || data.status === "blocked") {
    if (data.userId === context.userId) throw new Error("Sie können sich nicht selbst entfernen.");
    if (old.role === "super_admin") throw new Error("Geschäftsführung kann nicht aus dem Team entfernt werden.");
  }
  await db`
      update profiles set
        role = coalesce(${data.role ?? null}, role),
        status = coalesce(${data.status ?? null}, status),
        region_id = coalesce(${data.regionId ?? null}, region_id),
        supervisor_id = ${
          data.status === "inactive" || data.status === "blocked"
            ? null
            : data.supervisorId === void 0
              ? old.supervisor_id ?? null
              : data.supervisorId
        },
        user_type = coalesce(${data.userType ?? null}, user_type),
        monthly_target = coalesce(${data.monthlyTarget ?? null}, monthly_target),
        commission_stufe = coalesce(${data.commissionStufe ?? null}, commission_stufe),
        payout_iban = coalesce(${data.payoutIban === void 0 ? null : data.payoutIban ? (await import("@/lib/iban")).optionalIban(data.payoutIban) : ""}, payout_iban),
        payout_name = coalesce(${data.payoutName ?? null}, payout_name),
        onboarding_status = case when ${data.status ?? ""} = 'active' then 'aktiv' else onboarding_status end
      where user_id = ${data.userId}
    `;
  await audit(db, {
    userId: context.userId,
    action: "user.update",
    entityType: "profile",
    entityId: data.userId,
    oldValues: old,
    newValues: data
  });
  if (data.status === "active") await notify(db, {
    userId: data.userId,
    type: "system",
    title: "Zugang freigeschaltet",
    message: "Ihr E1-Zugang ist aktiv. Willkommen im Vertriebsportal.",
    link: "/portal"
  });
  if (data.status === "active") {
    const person = await loadProfile(db, data.userId);
    if (person) {
      await upsertPersonalIdentity(db, person.first_name, person.last_name, "mail-e1", person.user_id);
      try {
        const { provisionUserMailbox } = await import("./workspace.server");
        await provisionUserMailbox(db, {
          first: person.first_name,
          last: person.last_name,
          profileUserId: person.user_id,
        });
      } catch {
        /* queued even if processor is offline */
      }
    }
  }
  if (data.status === "inactive" || data.status === "blocked") {
    try {
      await db`update territories set user_id = null where user_id = ${data.userId}`;
    } catch {
      /* field tables */
    }
    try {
      await db`delete from session where "userId" = ${data.userId}`;
    } catch {
      try {
        await db`delete from "session" where user_id = ${data.userId}`;
      } catch {
        /* session table */
      }
    }
    const person = await loadProfile(db, data.userId);
    if (person) {
      try {
        const { suspendUserMailbox } = await import("./workspace.server");
        await suspendUserMailbox(db, person.user_id, person.first_name, person.last_name);
      } catch {
        /* queued */
      }
    }
  }
  return { ok: true };
});
export const listRegions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async () => {
  return (await sql())`
      select id, name, bundesland, plz_ranges from regions order by name
    `;
});
export const saveRegion = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "settings.manage")) throw new Error("Keine Berechtigung.");
  const id = data.id || nid();
  await db`
      insert into regions (id, name, bundesland, plz_ranges)
      values (${id}, ${data.name}, ${data.bundesland}, ${data.plz_ranges})
      on conflict (id) do update set name = excluded.name, bundesland = excluded.bundesland, plz_ranges = excluded.plz_ranges
    `;
  return { id };
});
export const saveProduct = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "products.manage")) throw new Error("Keine Berechtigung.");
  const id = data.id || nid();
  await db`
      insert into products (
        id, name, type, provider, base_price, work_price, guarantee_months, bonus, active,
        commission_abschluss, commission_folge, commission_bestand, storno_monate, internal_notes
      ) values (
        ${id}, ${data.name}, ${data.type}, ${data.provider}, ${data.base_price}, ${data.work_price},
        ${data.guarantee_months}, ${data.bonus}, ${data.active}, ${data.commission_abschluss},
        ${data.commission_folge}, ${data.commission_bestand}, ${data.storno_monate},
        ${data.internal_notes ?? null}
      )
      on conflict (id) do update set
        name = excluded.name, type = excluded.type, provider = excluded.provider,
        base_price = excluded.base_price, work_price = excluded.work_price,
        guarantee_months = excluded.guarantee_months, bonus = excluded.bonus, active = excluded.active,
        commission_abschluss = excluded.commission_abschluss, commission_folge = excluded.commission_folge,
        commission_bestand = excluded.commission_bestand, storno_monate = excluded.storno_monate,
        internal_notes = excluded.internal_notes
    `;
  await audit(db, {
    userId: context.userId,
    action: "product.save",
    entityType: "product",
    entityId: id,
    newValues: data
  });
  return { id };
});
export const adminListProducts = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  await requireProfile(db, context.userId);
  return (await db`select * from products order by provider, name`).map((r) => ({
    id: asStr(r.id),
    name: asStr(r.name),
    type: asStr(r.type),
    provider: asStr(r.provider),
    base_price: num(r.base_price),
    work_price: num(r.work_price),
    guarantee_months: num(r.guarantee_months),
    bonus: num(r.bonus),
    active: Boolean(r.active),
    commission_abschluss: num(r.commission_abschluss),
    commission_folge: num(r.commission_folge),
    commission_bestand: num(r.commission_bestand),
    storno_monate: num(r.storno_monate),
    internal_notes: asStr(r.internal_notes)
  }));
});
export const listFlags = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async () => {
  return (await sql())`
      select * from feature_flags order by phase, label
    `;
});
export const setFlag = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "settings.manage")) throw new Error("Keine Berechtigung.");
  await db`update feature_flags set enabled = ${data.enabled} where key = ${data.key}`;
  await audit(db, {
    userId: context.userId,
    action: "flag.set",
    entityType: "feature_flag",
    entityId: data.key,
    newValues: data
  });
  return { ok: true };
});
export const listAudit = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "audit.view")) throw new Error("Kein Zugriff");
  return (await db`
      select a.*, p.first_name, p.last_name
      from audit_log a
      left join profiles p on p.user_id = a.user_id
      order by a.created_at desc
      limit 200
    `).map((r) => ({
    id: asStr(r.id),
    user: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim() || asStr(r.user_id),
    action: asStr(r.action),
    entity_type: asStr(r.entity_type),
    entity_id: asStr(r.entity_id),
    created_at: asStr(r.created_at),
    new_values: r.new_values ? JSON.stringify(r.new_values) : ""
  }));
});
export const listLeads = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "contracts.view_all") && me.role !== "vertrieb" && me.role !== "teamleiter") throw new Error("Kein Zugriff");
  return (await db`select * from leads order by created_at desc`).map((r) => ({
    id: asStr(r.id),
    name: asStr(r.name),
    phone: asStr(r.phone),
    zip: asStr(r.zip),
    message: asStr(r.message),
    status: asStr(r.status),
    created_at: asStr(r.created_at)
  }));
});
export const updateLead = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  await requireProfile(db, context.userId);
  await db`
      update leads set status = ${data.status}, assigned_to = ${data.assignedTo ?? null}
      where id = ${data.id}
    `;
  return { ok: true };
});
export const deleteLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "contracts.view_all") && me.role !== "teamleiter" && me.role !== "super_admin") {
      throw new Error("Kein Zugriff");
    }
    const [row] = await db<{ id: string }>`select id from leads where id = ${data.id}`;
    if (!row) throw new Error("Anfrage nicht gefunden");
    await db`delete from leads where id = ${data.id}`;
    await audit(db, {
      userId: context.userId,
      action: "lead.delete",
      entityType: "lead",
      entityId: data.id,
    });
    return { ok: true };
  });
export const listApplications = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "users.manage") && me.role !== "gebietsleiter") throw new Error("Kein Zugriff");
  return (await db`
      select * from career_applications order by created_at desc
    `).map((r) => ({
    id: asStr(r.id),
    first_name: asStr(r.first_name),
    last_name: asStr(r.last_name),
    email: asStr(r.email),
    phone: asStr(r.phone),
    position: asStr(r.position),
    motivation: asStr(r.motivation),
    status: asStr(r.status),
    created_at: asStr(r.created_at)
  }));
});
export const updateApplication = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }) => {
  const db = await sql();
  await requireProfile(db, context.userId);
  await db`update career_applications set status = ${data.status} where id = ${data.id}`;
  return { ok: true };
});
export const listAlerts = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  if (!can(me.role, "team.view") && !can(me.role, "users.manage")) throw new Error("Kein Zugriff");
  return (await db`
      select q.*, p.first_name, p.last_name
      from quality_alerts q
      join profiles p on p.user_id = q.user_id
      where q.resolved = false
      order by q.created_at desc
    `).map((r) => ({
    id: asStr(r.id),
    user: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
    kind: asStr(r.kind),
    message: asStr(r.message),
    severity: asStr(r.severity),
    created_at: asStr(r.created_at)
  }));
});
export const resolveAlert = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((id) => id).handler(async ({ context, data: id }) => {
  const db = await sql();
  await requireProfile(db, context.userId);
  await db`update quality_alerts set resolved = true where id = ${id}`;
  return { ok: true };
});
export const getReports = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  const me = await requireProfile(db, context.userId);
  const ids = await visibleUserIds(db, me);
  const params = ids ? [ids] : [];
  const filter = ids ? "where user_id = any($1)" : "";
  const byDay = await db.query(`select to_char(created_at, 'YYYY-MM-DD') as d, count(*)::int as n
       from contracts ${filter}
       group by 1 order by 1 desc limit 30`, params);
  const reasons = await db.query(`select coalesce(cancel_reason,'(ohne Grund)') as cancel_reason, count(*)::int as n
       from contracts ${filter ? filter + " and" : "where"} status = 'storniert'
       group by 1 order by n desc`, params);
  const tot = (await db.query(`select
        count(*)::int as total,
        count(*) filter (where status = 'storniert')::int as storno,
        count(*) filter (where status in ('bestaetigt','beliefert','abgerechnet'))::int as won
      from contracts ${filter}`, params))[0] as Record<string, unknown> | undefined;
  return {
    byDay: byDay.map((r) => ({
      d: asStr(r.d),
      n: num(r.n)
    })).reverse(),
    reasons: reasons.map((r) => ({
      reason: asStr(r.cancel_reason),
      n: num(r.n)
    })),
    totals: {
      total: num(tot?.total),
      storno: num(tot?.storno),
      won: num(tot?.won),
    },
  };
});
export const listPartners = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const db = await sql();
  await requireProfile(db, context.userId);
  return (await db`
      select p.*, pc.status as contract_status, pc.commission_abschluss, pc.commission_struktur, pc.start_date
      from profiles p
      left join partner_contracts pc on pc.user_id = p.user_id
      where p.user_type in ('freier_handelsvertreter','partner') or p.role = 'partner'
      order by p.last_name
    `).map((r) => ({
    ...mapProfile(r),
    contract_status: asStr(r.contract_status),
    commission_abschluss: num(r.commission_abschluss),
    commission_struktur: num(r.commission_struktur),
    start_date: r.start_date ? asStr(r.start_date) : null
  }));
});

async function ensureMailDomain(db: Awaited<ReturnType<typeof sql>>) {
  const [row] = await db<Record<string, unknown>>`
    select * from mail_domains where domain = ${MAIL_DOMAIN} limit 1
  `;
  if (row) {
    await seedDefaultIdentities(db, asStr(row.id));
    return row;
  }
  await db`
    insert into mail_domains (id, domain, provider, dmarc_policy, report_to)
    values ('mail-e1', ${MAIL_DOMAIN}, ${MAIL_PROVIDER}, 'none', ${`dmarc@${MAIL_DOMAIN}`})
    on conflict (id) do update set provider = ${MAIL_PROVIDER}
  `;
  await seedDefaultIdentities(db, "mail-e1");
  const [created] = await db<Record<string, unknown>>`select * from mail_domains where id = 'mail-e1'`;
  return created!;
}

async function seedDefaultIdentities(db: Awaited<ReturnType<typeof sql>>, domainId: string) {
  for (const ident of DEFAULT_IDENTITIES) {
    const status = ident.mailbox_type === "shared" ? "shared" : "provisioned";
    await db`
      insert into mail_identities (id, domain_id, local_part, display_name, kind, purpose, mailbox_type, workspace_status)
      values (
        ${`mi-${ident.local_part}`},
        ${domainId},
        ${ident.local_part},
        ${ident.display_name},
        ${ident.kind},
        ${ident.purpose},
        ${ident.mailbox_type},
        ${status}
      )
      on conflict (domain_id, local_part) do update set
        display_name = excluded.display_name,
        kind = excluded.kind,
        purpose = excluded.purpose,
        mailbox_type = excluded.mailbox_type
    `;
  }
}

async function upsertPersonalIdentity(
  db: Awaited<ReturnType<typeof sql>>,
  first: string,
  last: string,
  domainId = "mail-e1",
  profileUserId?: string | null,
) {
  const local = workspaceLocalPart(first, last);
  if (!isValidLocalPart(local)) return;
  await db`
    insert into mail_identities (id, domain_id, local_part, display_name, kind, purpose, mailbox_type, profile_user_id, workspace_status)
    values (
      ${`mi-${local}`},
      ${domainId},
      ${local},
      ${`${first} ${last}`.trim()},
      ${"personal"},
      ${"Mitarbeiter-Postfach vorname.nachname"},
      ${"user"},
      ${profileUserId ?? null},
      ${"pending"}
    )
    on conflict (domain_id, local_part) do update set
      display_name = excluded.display_name,
      profile_user_id = coalesce(excluded.profile_user_id, mail_identities.profile_user_id)
  `;
}

async function syncPersonalIdentities(db: Awaited<ReturnType<typeof sql>>, domainId: string) {
  const people = await db<{ first_name: string; last_name: string; user_id: string }>`
    select first_name, last_name, user_id from profiles where status = 'active'
  `;
  for (const p of people) {
    await upsertPersonalIdentity(db, asStr(p.first_name), asStr(p.last_name), domainId, asStr(p.user_id));
  }
}

function asAuth(v: unknown): AuthState {
  const s = asStr(v);
  return (AUTH_STATES as readonly string[]).includes(s) ? (s as AuthState) : "fehlt";
}

function asPolicy(v: unknown): DmarcPolicy {
  const s = asStr(v);
  return (DMARC_POLICIES as readonly string[]).includes(s) ? (s as DmarcPolicy) : "none";
}

async function requireMailAdmin(db: Awaited<ReturnType<typeof sql>>, userId: string) {
  const me = await requireProfile(db, userId);
  if (!can(me.role, "settings.manage")) throw new Error("Keine Berechtigung für E-Mail-Sicherheit.");
  return me;
}

async function loadMailSecurity(db: Awaited<ReturnType<typeof sql>>) {
  const domain = await ensureMailDomain(db);
  await syncPersonalIdentities(db, asStr(domain.id));
  const identities = await db<Record<string, unknown>>`
    select * from mail_identities where domain_id = ${asStr(domain.id)}
    order by case kind
      when 'company' then 0
      when 'system' then 1
      when 'reports' then 2
      else 3 end, local_part
  `;
  const log = await db<Record<string, unknown>>`
    select * from mail_send_log order by created_at desc limit 20
  `;
  let jobs: Record<string, unknown>[] = [];
  try {
    jobs = await db<Record<string, unknown>>`
      select * from workspace_jobs order by created_at desc limit 30
    `;
  } catch {
    jobs = [];
  }
  const provider = MAIL_PROVIDER;
  const policy = asPolicy(domain.dmarc_policy);
  const reportTo = asStr(domain.report_to) || `dmarc@${MAIL_DOMAIN}`;
  const spf = asAuth(domain.spf_status);
  const dkim = asAuth(domain.dkim_status);
  const dmarc = asAuth(domain.dmarc_status);
  const { workspaceConnection } = await import("./workspace.server");
  const workspace = workspaceConnection();
  return {
    domain: asStr(domain.domain),
    provider,
    dmarc_policy: policy,
    report_to: reportTo,
    spf_status: spf,
    dkim_status: dkim,
    dmarc_status: dmarc,
    last_checked_at: domain.last_checked_at ? asStr(domain.last_checked_at) : null,
    notes: asStr(domain.notes),
    ready: mailReady(spf, dkim, dmarc),
    block_reason: denySendReason(spf, dkim, dmarc),
    records: dnsRecordsFor(provider, asStr(domain.domain), policy, reportTo),
    workspace,
    identities: identities.map((r) => ({
      id: asStr(r.id),
      address: mailAddress(asStr(r.local_part), asStr(domain.domain)),
      local_part: asStr(r.local_part),
      display_name: asStr(r.display_name),
      kind: asStr(r.kind) as MailIdentityKind,
      mailbox_type: (asStr(r.mailbox_type) || mailboxTypeFor(asStr(r.kind) as MailIdentityKind, asStr(r.local_part))) as MailboxType,
      workspace_status: (asStr(r.workspace_status) || "pending") as WorkspaceAccountStatus,
      purpose: asStr(r.purpose),
      active: Boolean(r.active),
      required: isRequiredLocalPart(asStr(r.local_part)),
    })),
    jobs: jobs.map((r) => ({
      id: asStr(r.id),
      action: asStr(r.action),
      local_part: asStr(r.local_part),
      display_name: asStr(r.display_name),
      status: asStr(r.status),
      error: r.error ? asStr(r.error) : null,
      created_at: asStr(r.created_at),
      processed_at: r.processed_at ? asStr(r.processed_at) : null,
    })),
    log: log.map((r) => ({
      id: asStr(r.id),
      from_address: asStr(r.from_address),
      purpose: asStr(r.purpose),
      allowed: Boolean(r.allowed),
      reason: r.reason ? asStr(r.reason) : null,
      created_at: asStr(r.created_at),
    })),
  };
}

export const getMailSecurity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    await requireMailAdmin(db, context.userId);
    return loadMailSecurity(db);
  });

export const updateMailSecurity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      dmarc_policy?: DmarcPolicy;
      report_to?: string;
      spf_status?: AuthState;
      dkim_status?: AuthState;
      dmarc_status?: AuthState;
      notes?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireMailAdmin(db, context.userId);
    const domain = await ensureMailDomain(db);
    const reportTo = data.report_to?.trim();
    if (reportTo && !isCompanySender(reportTo)) {
      throw new Error(`Reports nur an Postfächer @${MAIL_DOMAIN}.`);
    }
    await db`
      update mail_domains set
        provider = ${MAIL_PROVIDER},
        dmarc_policy = coalesce(${data.dmarc_policy ?? null}, dmarc_policy),
        report_to = coalesce(${reportTo ?? null}, report_to),
        spf_status = coalesce(${data.spf_status ?? null}, spf_status),
        dkim_status = coalesce(${data.dkim_status ?? null}, dkim_status),
        dmarc_status = coalesce(${data.dmarc_status ?? null}, dmarc_status),
        notes = coalesce(${data.notes ?? null}, notes),
        last_checked_at = now()
      where id = ${asStr(domain.id)}
    `;
    await audit(db, {
      userId: context.userId,
      action: "mail.security.update",
      entityType: "mail_domain",
      entityId: asStr(domain.id),
      newValues: data,
    });
    return loadMailSecurity(db);
  });

export const checkMailDns = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    await requireMailAdmin(db, context.userId);
    const domain = await ensureMailDomain(db);
    const { probeMailDns } = await import("@/lib/mail-check.server");
    const probe = await probeMailDns(asStr(domain.domain));
    await db`
      update mail_domains set
        spf_status = ${probe.spf},
        dkim_status = ${probe.dkim},
        dmarc_status = ${probe.dmarc},
        dmarc_policy = coalesce(${probe.dmarc_policy}, dmarc_policy),
        last_checked_at = now(),
        notes = coalesce(${probe.error}, notes)
      where id = ${asStr(domain.id)}
    `;
    await audit(db, {
      userId: context.userId,
      action: "mail.security.dns_check",
      entityType: "mail_domain",
      entityId: asStr(domain.id),
      newValues: { spf: probe.spf, dkim: probe.dkim, dmarc: probe.dmarc, error: probe.error },
    });
    const security = await loadMailSecurity(db);
    return { ...security, probe };
  });

export const addMailIdentity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { firstName?: string; lastName?: string; localPart?: string; displayName?: string; kind?: MailIdentityKind; purpose?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireMailAdmin(db, context.userId);
    const domain = await ensureMailDomain(db);
    const local = data.localPart?.trim()
      ? normalizeLocalPart(data.localPart)
      : workspaceLocalPart(data.firstName ?? "", data.lastName ?? "");
    if (!isValidLocalPart(local)) {
      throw new Error("Ungültiger Lokalteil. Format vorname.nachname oder info.");
    }
    const display =
      data.displayName?.trim() ||
      `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() ||
      local;
    const kind: MailIdentityKind = data.kind ?? "personal";
    const mailboxType = mailboxTypeFor(kind, local);
    await db`
      insert into mail_identities (id, domain_id, local_part, display_name, kind, purpose, mailbox_type, workspace_status)
      values (
        ${`mi-${local}`},
        ${asStr(domain.id)},
        ${local},
        ${display},
        ${kind},
        ${data.purpose?.trim() || "Mitarbeiter-Postfach"},
        ${mailboxType},
        ${"queued"}
      )
      on conflict (domain_id, local_part) do update set
        display_name = excluded.display_name,
        purpose = excluded.purpose,
        active = true,
        workspace_status = 'queued'
    `;
    try {
      const { enqueueWorkspaceJob } = await import("./workspace.server");
      await enqueueWorkspaceJob(db, {
        action: mailboxType === "shared" ? "ensure_shared" : "create_user",
        localPart: local,
        displayName: display,
      });
    } catch {
      /* job table may not exist yet during first boot */
    }
    await audit(db, {
      userId: context.userId,
      action: "mail.identity.add",
      entityType: "mail_identity",
      entityId: local,
      newValues: { local, kind },
    });
    return loadMailSecurity(db);
  });

export const toggleMailIdentity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; active: boolean }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireMailAdmin(db, context.userId);
    const [row] = await db<Record<string, unknown>>`
      select * from mail_identities where id = ${data.id}
    `;
    if (!row) throw new Error("Postfach nicht gefunden.");
    if (isRequiredLocalPart(asStr(row.local_part)) && !data.active) {
      throw new Error("Firmen- und Systempostfächer bleiben aktiv.");
    }
    await db`update mail_identities set active = ${data.active} where id = ${data.id}`;
    try {
      const local = asStr(row.local_part);
      const display = asStr(row.display_name);
      const profileId = row.profile_user_id ? asStr(row.profile_user_id) : null;
      const { enqueueWorkspaceJob } = await import("./workspace.server");
      await enqueueWorkspaceJob(db, {
        action: data.active ? "unsuspend_user" : "suspend_user",
        localPart: local,
        displayName: display,
        profileUserId: profileId,
      });
    } catch {
      /* ignore */
    }
    return loadMailSecurity(db);
  });

export const testMailSend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { from: string; purpose: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireMailAdmin(db, context.userId);
    const domain = await ensureMailDomain(db);
    const from = data.from.trim().toLowerCase();
    if (!isCompanySender(from, asStr(domain.domain))) {
      throw new Error(`Nur Absender @${MAIL_DOMAIN} sind zugelassen.`);
    }
    const local = from.split("@")[0] ?? "";
    const [ident] = await db<Record<string, unknown>>`
      select * from mail_identities
      where domain_id = ${asStr(domain.id)} and lower(local_part) = ${local}
    `;
    if (!ident) {
      const unknown = "Unbekannter Absender. Keine halben Postfächer ohne Eintrag.";
      await db`
        insert into mail_send_log (id, from_address, purpose, allowed, reason, created_by)
        values (${nid()}, ${from}, ${data.purpose.trim() || "test"}, false, ${unknown}, ${context.userId})
      `;
      throw new Error(unknown);
    }
    if (!ident.active) {
      const inactive = "Dieses Postfach ist deaktiviert.";
      await db`
        insert into mail_send_log (id, from_address, purpose, allowed, reason, created_by)
        values (${nid()}, ${from}, ${data.purpose.trim() || "test"}, false, ${inactive}, ${context.userId})
      `;
      throw new Error(inactive);
    }
    const reason = denySendReason(
      asAuth(domain.spf_status),
      asAuth(domain.dkim_status),
      asAuth(domain.dmarc_status),
    );
    const allowed = !reason;
    await db`
      insert into mail_send_log (id, from_address, purpose, allowed, reason, created_by)
      values (${nid()}, ${from}, ${data.purpose.trim() || "test"}, ${allowed}, ${reason}, ${context.userId})
    `;
    if (!allowed) throw new Error(reason);
    try {
      const { queuePortalMail } = await import("./workspace.server");
      await queuePortalMail(db, {
        from,
        to: from,
        subject: `E1 Test · ${data.purpose.trim() || "Portal-Test"}`,
        text: "Testfreigabe aus dem E1-Portal. Versand über die Gmail API von Google Workspace. Render ist nur der Server.",
        purpose: data.purpose.trim() || "test",
      });
    } catch {
      /* queued when table exists */
    }
    return { ok: true, message: "Testfreigabe erteilt. Versand über Gmail API, kein Mailserver auf Render." };
  });

export const runWorkspaceJobs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    await requireMailAdmin(db, context.userId);
    const { processWorkspaceJobs } = await import("./workspace.server");
    const results = await processWorkspaceJobs(db);
    await audit(db, {
      userId: context.userId,
      action: "workspace.jobs.run",
      entityType: "workspace",
      entityId: "ws-e1",
      newValues: { count: results.length },
    });
    const security = await loadMailSecurity(db);
    return { ...security, results };
  });

export const getOpsSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "settings.manage")) throw new Error("Kein Zugriff");
    const rows = await db<{ key: string; value: string }>`
      select key, value from settings
      where key in ('require_2fa','newsales_handover_to','quality_warn_rate','quality_block_rate','storno_window_days','payout_debtor_name','payout_debtor_iban','payout_debtor_bic')
    `;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      require_2fa: map.require_2fa || "admins",
      newsales_handover_to: map.newsales_handover_to || "business@e1direktvertrieb.de",
      quality_warn_rate: map.quality_warn_rate || "0.25",
      quality_block_rate: map.quality_block_rate || "0.40",
      storno_window_days: map.storno_window_days || "14",
      newsales_api: (await import("@/lib/newsales")).newsalesConfigured(),
      payout_debtor_name: map.payout_debtor_name || "E1 Direktvertrieb Inh. Orhan Salo und Luca Marrancone",
      payout_debtor_iban: map.payout_debtor_iban || "",
      payout_debtor_bic: map.payout_debtor_bic || "",
    };
  });

export const saveOpsSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { require_2fa?: string; newsales_handover_to?: string; quality_warn_rate?: string; quality_block_rate?: string; storno_window_days?: string; payout_debtor_name?: string; payout_debtor_iban?: string; payout_debtor_bic?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "settings.manage")) throw new Error("Kein Zugriff");
    for (const [key, value] of Object.entries(data)) {
      if (value == null) continue;
      await db`
        insert into settings (key, value) values (${key}, ${String(value)})
        on conflict (key) do update set value = excluded.value
      `;
    }
    await audit(db, { userId: context.userId, action: "settings.ops", entityType: "settings", entityId: "ops", newValues: data });
    return getOpsSettings();
  });

export const exportOpsCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: "auftraege" | "provisionen" | "datev") => kind)
  .handler(async ({ context, data: kind }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "reports.export")) throw new Error("Kein Export-Recht");
    const { csvTable } = await import("@/lib/ops");
    const ids = await visibleUserIds(db, me);
    if (kind === "provisionen") {
      const rows = ids
        ? await db<Record<string, unknown>>`
            select cm.calculated_at, pr.first_name, pr.last_name, cm.type, p.name as product, cm.amount, cm.status, cm.contract_id
            from commissions cm
            join contracts c on c.id = cm.contract_id
            left join profiles pr on pr.user_id = cm.user_id
            left join products p on p.id = c.product_id
            where cm.user_id = any(${ids})
            order by cm.calculated_at desc`
        : await db<Record<string, unknown>>`
            select cm.calculated_at, pr.first_name, pr.last_name, cm.type, p.name as product, cm.amount, cm.status, cm.contract_id
            from commissions cm
            join contracts c on c.id = cm.contract_id
            left join profiles pr on pr.user_id = cm.user_id
            left join products p on p.id = c.product_id
            order by cm.calculated_at desc`;
      return {
        filename: "e1-provisionen.csv",
        csv: csvTable(
          ["Datum", "Berater", "Typ", "Produkt", "Netto", "USt 19%", "Brutto", "Status", "Auftrag"],
          rows.map((r) => {
            const v = vatOn(num(r.amount));
            return [
              asStr(r.calculated_at),
              `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
              asStr(r.type),
              asStr(r.product),
              v.net.toFixed(2).replace(".", ","),
              v.vat.toFixed(2).replace(".", ","),
              v.gross.toFixed(2).replace(".", ","),
              asStr(r.status),
              asStr(r.contract_id),
            ];
          }),
        ),
      };
    }
    if (kind === "datev") {
      const rows = ids
        ? await db<Record<string, unknown>>`
            select cm.calculated_at, cm.amount, cm.type, cm.contract_id, pr.last_name
            from commissions cm
            left join profiles pr on pr.user_id = cm.user_id
            where cm.status in ('freigegeben','ausgezahlt') and cm.user_id = any(${ids})
            order by cm.calculated_at`
        : await db<Record<string, unknown>>`
            select cm.calculated_at, cm.amount, cm.type, cm.contract_id, pr.last_name
            from commissions cm
            left join profiles pr on pr.user_id = cm.user_id
            where cm.status in ('freigegeben','ausgezahlt')
            order by cm.calculated_at`;
      return {
        filename: "e1-datev-provisionen.csv",
        csv: csvTable(
          ["Belegfeld1", "Buchungstext", "Netto", "USt 19%", "Brutto", "SollHaben", "Datum", "Berater"],
          rows.map((r) => {
            const v = vatOn(num(r.amount));
            return [
              asStr(r.contract_id),
              `Provision ${asStr(r.type)} ${asStr(r.contract_id)} netto zzgl. 19% USt`,
              v.net.toFixed(2).replace(".", ","),
              v.vat.toFixed(2).replace(".", ","),
              v.gross.toFixed(2).replace(".", ","),
              num(r.amount) >= 0 ? "S" : "H",
              asStr(r.calculated_at).slice(0, 10),
              asStr(r.last_name),
            ];
          }),
        ),
      };
    }
    const rows = ids
      ? await db<Record<string, unknown>>`
          select c.id, c.created_at, c.status, c.type, c.consumption_kwh, c.commission_amount,
                 cu.first_name, cu.last_name, cu.phone, cu.zip, cu.city,
                 coalesce(t.name, p.name) as product, coalesce(t.provider, p.provider) as provider,
                 pr.staff_id, pr.first_name as advisor_first, pr.last_name as advisor_last
          from contracts c
          join customers cu on cu.id = c.customer_id
          left join products p on p.id = c.product_id
          left join tariffs t on t.id = c.tariff_id
          left join profiles pr on pr.user_id = c.user_id
          where c.user_id = any(${ids})
          order by c.created_at desc`
      : await db<Record<string, unknown>>`
          select c.id, c.created_at, c.status, c.type, c.consumption_kwh, c.commission_amount,
                 cu.first_name, cu.last_name, cu.phone, cu.zip, cu.city,
                 coalesce(t.name, p.name) as product, coalesce(t.provider, p.provider) as provider,
                 pr.staff_id, pr.first_name as advisor_first, pr.last_name as advisor_last
          from contracts c
          join customers cu on cu.id = c.customer_id
          left join products p on p.id = c.product_id
          left join tariffs t on t.id = c.tariff_id
          left join profiles pr on pr.user_id = c.user_id
          order by c.created_at desc`;
    return {
      filename: "E1-Abschluesse.csv",
      csv: csvTable(
        [
          "Datum",
          "Mitarbeiter-ID",
          "Berater",
          "Kunde",
          "Telefon",
          "PLZ",
          "Ort",
          "Sparte",
          "Tarif",
          "Anbieter",
          "kWh",
          "Provision netto",
          "USt 19%",
          "Brutto",
          "Status",
        ],
        rows.map((r) => {
          const v = vatOn(num(r.commission_amount));
          return [
          asStr(r.created_at).slice(0, 16).replace("T", " "),
          asStr(r.staff_id),
          `${asStr(r.advisor_first)} ${asStr(r.advisor_last)}`.trim(),
          `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
          asStr(r.phone),
          asStr(r.zip),
          asStr(r.city),
          asStr(r.type),
          asStr(r.product),
          asStr(r.provider),
          num(r.consumption_kwh),
          v.net.toFixed(2).replace(".", ","),
          v.vat.toFixed(2).replace(".", ","),
          v.gross.toFixed(2).replace(".", ","),
          asStr(r.status),
        ];
        }),
      ),
    };
  });

