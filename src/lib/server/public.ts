import { createServerFn } from "@tanstack/react-start";
import { nid } from "@/lib/utils";
import { sql } from "./helpers";
import { MAIL_DOMAIN } from "@/lib/mail";
import { PUBLIC_PHONE, PUBLIC_PHONE_LABEL } from "@/lib/contact";
import { OWN_SUPPLY_LIVE } from "@/lib/features";

export const getPublicContact = createServerFn({ method: "GET" }).handler(async () => {
  const envPhone = (process.env.PUBLIC_PHONE || process.env.E1_PUBLIC_PHONE || "").trim();
  let phone = envPhone || PUBLIC_PHONE;
  let label = PUBLIC_PHONE_LABEL;
  try {
    const db = await sql();
    const rows = await db<{ key: string; value: string }>`
      select key, value from settings where key in ('public_phone', 'public_phone_label')
    `;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    if ((map.public_phone || "").trim()) phone = map.public_phone.trim();
    if ((map.public_phone_label || "").trim()) label = map.public_phone_label.trim();
  } catch {
    /* Settings optional */
  }
  return {
    email: `info@${MAIL_DOMAIN}`,
    phone,
    label,
  };
});

export const getPublicCalc = createServerFn({ method: "GET" }).handler(async () => {
  const { PLACEHOLDER_COMPARE } = await import("@/lib/rechner");
  const out = {
    privat_strom_ct: String(PLACEHOLDER_COMPARE.privat.strom.arbeitCt),
    privat_strom_grund: String(PLACEHOLDER_COMPARE.privat.strom.grundEurYear),
    privat_gas_ct: String(PLACEHOLDER_COMPARE.privat.gas.arbeitCt),
    privat_gas_grund: String(PLACEHOLDER_COMPARE.privat.gas.grundEurYear),
    gewerbe_strom_ct: String(PLACEHOLDER_COMPARE.gewerbe.strom.arbeitCt),
    gewerbe_strom_grund: String(PLACEHOLDER_COMPARE.gewerbe.strom.grundEurYear),
    gewerbe_gas_ct: String(PLACEHOLDER_COMPARE.gewerbe.gas.arbeitCt),
    gewerbe_gas_grund: String(PLACEHOLDER_COMPARE.gewerbe.gas.grundEurYear),
    live: false,
  };
  try {
    const db = await sql();
    const rows = await db<{ key: string; value: string }>`
      select key, value from settings where key like 'calc_%'
    `;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    const take = (k: string, fallback: string) => (map[k] && Number(map[k]) > 0 ? map[k] : fallback);
    out.privat_strom_ct = take("calc_privat_strom_ct", out.privat_strom_ct);
    out.privat_strom_grund = take("calc_privat_strom_grund", out.privat_strom_grund);
    out.privat_gas_ct = take("calc_privat_gas_ct", out.privat_gas_ct);
    out.privat_gas_grund = take("calc_privat_gas_grund", out.privat_gas_grund);
    out.gewerbe_strom_ct = take("calc_gewerbe_strom_ct", out.gewerbe_strom_ct);
    out.gewerbe_strom_grund = take("calc_gewerbe_strom_grund", out.gewerbe_strom_grund);
    out.gewerbe_gas_ct = take("calc_gewerbe_gas_ct", out.gewerbe_gas_ct);
    out.gewerbe_gas_grund = take("calc_gewerbe_gas_grund", out.gewerbe_gas_grund);
    out.live = Boolean(map.calc_live === "1" || map.calc_live === "true");
  } catch {
    /* defaults */
  }
  return out;
});

export const submitLead = createServerFn({ method: "POST" })
  .validator((d: { name: string; phone: string; zip?: string; message?: string; consent: boolean; kind?: string; company?: string }) => d)
  .handler(async ({ data }) => {
    if (!data.name?.trim() || !data.phone?.trim()) throw new Error("Name und Telefon sind Pflicht.");
    if (!data.consent) throw new Error("Bitte der Datenverarbeitung zustimmen.");
    const kind = data.kind === "gewerbe" ? "gewerbe" : "privat";
    const company = data.company?.trim() || null;
    const db = await sql();
    await db`
      insert into leads (id, name, phone, zip, message, kind, company)
      values (
        ${nid()}, ${data.name.trim()}, ${data.phone.trim()}, ${data.zip?.trim() || null},
        ${data.message?.trim() || null}, ${kind}, ${company}
      )
    `;
    const who = kind === "gewerbe" ? `Gewerbe${company ? ` · ${company}` : ""}` : "Privat";
    try {
      const { queuePortalMail } = await import("./workspace.server");
      const text = `${who}\nName: ${data.name.trim()}\nTelefon: ${data.phone.trim()}\nPLZ: ${data.zip?.trim() || "—"}\n\n${data.message?.trim() || ""}`;
      await queuePortalMail(db, {
        from: `info@${MAIL_DOMAIN}`,
        to: `info@${MAIL_DOMAIN}, orhan.salo@${MAIL_DOMAIN}, luca.marrancone@${MAIL_DOMAIN}`,
        subject: `Neue Beratung · ${who} · ${data.name.trim()}`,
        text,
        purpose: "lead",
      });
    } catch {
      /* queued when Workspace verbunden */
    }
    try {
      const { notify } = await import("./helpers");
      const admins = await db<{ user_id: string }>`select user_id from profiles where role = 'super_admin'`;
      for (const a of admins) {
        await notify(db, {
          userId: a.user_id,
          type: "lead",
          title: "Neue Beratungsanfrage",
          message: `${who} · ${data.name.trim()} · ${data.phone.trim()}`,
          link: "/portal/admin/leads",
        });
      }
    } catch {
      /* notifications optional */
    }
    try {
      const { ingestMessage } = await import("./mailbox.server");
      await ingestMessage(db, {
        mailbox: "info",
        direction: "in",
        from_address: `${data.name.trim().toLowerCase().replace(/\s+/g, ".")}@anfrage.e1direktvertrieb.de`,
        from_name: data.name.trim(),
        to_addresses: `info@${MAIL_DOMAIN}`,
        subject: `Neue Beratung · ${data.name.trim()}`,
        body_text: `Name: ${data.name.trim()}\nTelefon: ${data.phone.trim()}\nPLZ: ${data.zip?.trim() || "—"}\n\n${data.message?.trim() || ""}`,
        unread: true,
        folder: "inbox",
      });
    } catch {
      /* inbox table after migration */
    }
    return { ok: true };
  });

export const submitApplication = createServerFn({ method: "POST" })
  .validator(
    (d: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      position: string;
      motivation: string;
      consent: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    if (!data.firstName?.trim() || !data.lastName?.trim()) throw new Error("Name ist Pflicht.");
    if (!data.email?.includes("@")) throw new Error("E-Mail ist ungültig.");
    if (!data.phone?.trim()) throw new Error("Telefon ist Pflicht.");
    if (!data.motivation?.trim()) throw new Error("Bitte schreiben Sie ein paar Zeilen zu Ihrer Motivation.");
    if (!data.consent) throw new Error("Bitte der Datenverarbeitung zustimmen.");
    const db = await sql();
    await db`
      insert into career_applications (id, first_name, last_name, email, phone, position, motivation)
      values (
        ${nid()}, ${data.firstName.trim()}, ${data.lastName.trim()}, ${data.email.trim()},
        ${data.phone.trim()}, ${data.position || "Vertriebsmitarbeiter (m/w/d)"}, ${data.motivation.trim()}
      )
    `;
    try {
      const { queuePortalMail } = await import("./workspace.server");
      await queuePortalMail(db, {
        from: `bewerbung@${MAIL_DOMAIN}`,
        to: `bewerbung@${MAIL_DOMAIN}, orhan.salo@${MAIL_DOMAIN}, luca.marrancone@${MAIL_DOMAIN}`,
        subject: `Bewerbung · ${data.firstName.trim()} ${data.lastName.trim()} · ${data.position}`,
        text: `${data.firstName.trim()} ${data.lastName.trim()}\n${data.email.trim()}\n${data.phone.trim()}\n${data.position}\n\n${data.motivation.trim()}`,
        purpose: "bewerbung",
      });
    } catch {
      /* queued */
    }
    try {
      const { ingestMessage } = await import("./mailbox.server");
      await ingestMessage(db, {
        mailbox: "bewerbung",
        direction: "in",
        from_address: data.email.trim(),
        from_name: `${data.firstName.trim()} ${data.lastName.trim()}`,
        to_addresses: `bewerbung@${MAIL_DOMAIN}`,
        subject: `Bewerbung · ${data.firstName.trim()} ${data.lastName.trim()} · ${data.position}`,
        body_text: `${data.firstName.trim()} ${data.lastName.trim()}\n${data.email.trim()}\n${data.phone.trim()}\n${data.position}\n\n${data.motivation.trim()}`,
        unread: true,
        folder: "inbox",
      });
    } catch {
      /* inbox table after migration */
    }
    return { ok: true };
  });

export const customerSelfLookup = createServerFn({ method: "POST" })
  .validator((d: { lastName: string; zip: string; contractId: string }) => d)
  .handler(async ({ data }) => {
    const db = await sql();
    const flags = await db<{ enabled: boolean }>`select enabled from feature_flags where key = 'phase2_self_service'`;
    if (!flags[0]?.enabled) throw new Error("Kundenportal ist noch nicht aktiv.");
    const [row] = await db<Record<string, unknown>>`
      select c.id, c.status, c.type, c.start_date, p.name as product_name,
             cu.first_name, cu.last_name, cu.city
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join products p on p.id = c.product_id
      where c.id = ${data.contractId.trim()}
        and lower(cu.last_name) = ${data.lastName.trim().toLowerCase()}
        and cu.zip = ${data.zip.trim()}
    `;
    if (!row) throw new Error("Kein Vertrag gefunden. Prüfen Sie Auftragsnummer, Name und PLZ.");
    return {
      id: String(row.id),
      status: String(row.status),
      type: String(row.type),
      start_date: row.start_date ? String(row.start_date) : null,
      product_name: String(row.product_name ?? ""),
      name: `${row.first_name} ${row.last_name}`,
      city: String(row.city ?? ""),
    };
  });

export const listPublicE1Tariffs = createServerFn({ method: "POST" })
  .validator((d: { type?: string; kind?: string; kwh?: number } = {}) => d)
  .handler(async ({ data }) => {
    const db = await sql();
    const type = data.type === "gas" ? "gas" : data.type === "strom" ? "strom" : "";
    const kind = data.kind === "gewerbe" ? "gewerbe" : data.kind === "privat" ? "privat" : "";
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await db<Record<string, unknown>>`
      select id, name, type, kind, arbeit_ct, grund_year, bonus_year
      from tariffs
      where provider = 'E1'
        and (${type} = '' or type = ${type})
        and (kind = 'beide' or ${kind} = '' or kind = ${kind})
      order by type, name
    `;
    } catch {
      rows = [];
    }
    const fallback = [
      { id: "e1-strom-privat", name: "E1 Strom Haushalt", type: "strom", kind: "privat", arbeit_ct: 29.5, grund_year: 144, bonus_year: 0, provider: "E1", comingSoon: true },
      { id: "e1-gas-privat", name: "E1 Gas Haushalt", type: "gas", kind: "privat", arbeit_ct: 11.5, grund_year: 144, bonus_year: 0, provider: "E1", comingSoon: true },
    ].filter((t) => (!type || t.type === type) && (!kind || t.kind === kind || t.kind === "beide"));
    let partner: Record<string, unknown>[] = [];
    try {
      partner = await db<Record<string, unknown>>`
        select id, name, type, provider
        from tariffs
        where active = true and provider <> 'E1'
          and (${type} = '' or type = ${type})
        order by provider, name
        limit 40
      `;
    } catch {
      partner = [];
    }
    const e1 = (rows.length ? rows : fallback).map((r) => ({
      ...r,
      provider: "E1",
      comingSoon: true,
    }));
    const source = [...e1, ...partner];
    const kwh = Number(data.kwh) || 0;
    return {
      ready: true,
      newsales: Boolean((process.env.NEWSALES_API_URL || "").trim() && (process.env.NEWSALES_API_KEY || "").trim()),
      items: source.map((r) => {
        const arbeit = Number(r.arbeit_ct) || 0;
        const grund = Number(r.grund_year) || 0;
        const bonus = Number(r.bonus_year) || 0;
        const year = kwh > 0 ? Math.round((kwh * (arbeit / 100) + grund - bonus) * 100) / 100 : 0;
        return {
          id: String(r.id),
          name: String(r.name),
          provider: String(r.provider || "E1"),
          type: String(r.type),
          kind: String(r.kind || "privat"),
          arbeit_ct: arbeit,
          grund_year: grund,
          bonus_year: bonus,
          year,
          comingSoon: !OWN_SUPPLY_LIVE || Boolean(r.comingSoon) || String(r.provider) === "E1",
        };
      }),
    };
  });

export const submitE1WebOrder = createServerFn({ method: "POST" })
  .validator((d: {
    tariffId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    street: string;
    house: string;
    zip: string;
    city: string;
    kwh: number;
    consent: boolean;
    previousProvider?: string;
    previousCustomerNo?: string;
    meter?: string;
    kuendigen?: boolean;
    iban?: string;
    bankOwner?: string;
    sepa?: boolean;
    kind?: string;
  }) => d)
  .handler(async ({ data }) => {
    if (!data.consent) throw new Error("Bitte Datenschutz zustimmen.");
    if (!data.firstName.trim() || !data.lastName.trim()) throw new Error("Name fehlt.");
    if (!data.email.includes("@")) throw new Error("E-Mail fehlt.");
    if (!data.phone.trim()) throw new Error("Telefon fehlt.");
    if (!data.street.trim() || !data.house.trim() || data.zip.replace(/\D/g, "").length !== 5 || !data.city.trim()) {
      throw new Error("Adresse unvollständig.");
    }
    if (!Number(data.kwh)) throw new Error("Verbrauch in kWh fehlt.");
    const { optionalIban } = await import("@/lib/iban");
    const iban = optionalIban(data.iban);
    if (!iban) throw new Error("IBAN ist auf der Website Pflicht.");
    if (!data.sepa) throw new Error("SEPA-Lastschrift auf der Website bestätigen.");
    const db = await sql();
    const [tariff] = await db<Record<string, unknown>>`
      select * from tariffs where id = ${data.tariffId}
    `;
    const tariffRow = tariff || {
      id: data.tariffId,
      type: "strom",
      name: "Tarif",
      provider: "E1",
    };
    if (!OWN_SUPPLY_LIVE && (String(tariffRow.provider) === "E1" || String(tariffRow.id).startsWith("e1-"))) {
      throw new Error("E1 eigener Strom ist vorbereitet, aber noch nicht aktiv. Bitte einen Partner-Tarif wählen.");
    }
    const [owner] = await db<{ user_id: string }>`
      select user_id from profiles
      where role = 'super_admin' and status = 'active'
      order by case when lower(staff_id) in ('orhan','luca') then 0 else 1 end
      limit 1
    `;
    if (!owner) throw new Error("Kein Gründer-Konto für die Buchung.");
    const customerId = nid();
    const contractId = nid();
    const kwh = Number(data.kwh);
    const { splitDeal } = await import("@/lib/tariffs");
    const bands = await db<Record<string, unknown>>`
      select stufe, kwh_from, kwh_to, amount_eur, amount_ct_kwh
      from tariff_bands where tariff_id = ${data.tariffId}
    `;
    const parsed = bands.map((b) => ({
      stufe: Number(b.stufe) || 13,
      kwh_from: Number(b.kwh_from) || 0,
      kwh_to: Number(b.kwh_to) || 999999,
      amount_eur: Number(b.amount_eur) || 160,
      amount_ct_kwh: Number(b.amount_ct_kwh) || 0,
    }));
    const split = splitDeal(parsed, 13, kwh);
    const amount = split.ok ? split.advisor : 160;
    await db`
      insert into customers (
        id, first_name, last_name, email, phone, street, house_number, zip, city, consents
      ) values (
        ${customerId}, ${data.firstName.trim()}, ${data.lastName.trim()},
        ${data.email.trim().toLowerCase()}, ${data.phone.trim()},
        ${data.street.trim()}, ${data.house.trim()}, ${data.zip.replace(/\D/g, "").slice(0, 5)},
        ${data.city.trim()}, ${JSON.stringify({ web: true, kind: data.kind || "privat" })}::jsonb
      )
    `;
    await db`
      insert into contracts (
        id, customer_id, user_id, type, tariff_id, status, consumption_kwh,
        commission_rate, commission_amount, commission_stufe,
        agency_amount, advisor_amount, margin_amount,
        privacy_confirmed, sepa_confirmed, source, notes, previous_provider, meter_number,
        bank_iban, bank_owner
      ) values (
        ${contractId}, ${customerId}, ${owner.user_id}, ${String(tariffRow.type)}, ${String(tariffRow.id)},
        'uebermittelt', ${kwh}, ${amount}, ${amount}, 13,
        ${amount}, ${amount}, 0,
        true, ${Boolean(data.sepa && iban)}, ${"newsales_web"},
        ${data.kuendigen ? `Website gebucht · Kündigung ${data.previousProvider || "Altanbieter"}` : "Website gebucht · Marge komplett Gründer"},
        ${data.previousProvider?.trim() || null}, ${data.meter?.trim() || null},
        ${iban || null}, ${data.bankOwner?.trim() || `${data.firstName} ${data.lastName}`.trim()}
      )
    `;
    await db`
      insert into status_history (id, contract_id, old_status, new_status, changed_by, comment)
      values (${nid()}, ${contractId}, null, ${"uebermittelt"}, ${owner.user_id}, ${"Website-Abschluss gebucht"})
    `;
    try {
      const { newsalesConfigured, submitNewsalesOrder } = await import("./newsales.server");
      if (newsalesConfigured()) {
        const pushed = await submitNewsalesOrder({
          portalId: contractId,
          advisorId: owner.user_id,
          advisorName: "E1 Website",
          customer: {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            phone: data.phone.trim(),
            email: data.email.trim(),
            street: data.street.trim(),
            houseNumber: data.house.trim(),
            zip: data.zip.replace(/\D/g, "").slice(0, 5),
            city: data.city.trim(),
          },
          productName: String(tariffRow.name),
          provider: String(tariffRow.provider),
          type: String(tariffRow.type),
          consumptionKwh: kwh,
          meterNumber: data.meter,
          previousProvider: data.previousProvider,
          iban,
          bankOwner: data.bankOwner || `${data.firstName} ${data.lastName}`.trim(),
          notes: data.kuendigen ? "Kündigung übernehmen" : "",
        });
        if (pushed.ok && pushed.ref) {
          await db`update contracts set newsales_ref = ${pushed.ref}, source = ${"newsales_api"} where id = ${contractId}`;
        }
      }
    } catch {
      /* API optional bis Zugänge da sind */
    }
    try {
      const { notify } = await import("./helpers");
      const admins = await db<{ user_id: string }>`select user_id from profiles where role = 'super_admin'`;
      for (const a of admins) {
        await notify(db, {
          userId: a.user_id,
          type: "auftrag",
          title: "Website-Abschluss",
          message: `${data.firstName} ${data.lastName} · ${String(tariffRow.name)} · ${amount.toFixed(2)} €`,
          link: `/portal/auftraege/${contractId}`,
        });
      }
    } catch {
      /* */
    }
    if (data.kuendigen) {
      try {
        const { kuendigungLines } = await import("@/lib/kuendigung");
        const { buildPagedPdf } = await import("@/lib/sign");
        const { putFile } = await import("./ops.server");
        const lines = kuendigungLines({
          first: data.firstName,
          last: data.lastName,
          street: data.street,
          house: data.house,
          zip: data.zip,
          city: data.city,
          email: data.email,
          phone: data.phone,
          provider: data.previousProvider || "bisheriger Lieferant",
          customerNo: data.previousCustomerNo,
          meter: data.meter,
          type: String(tariffRow.type),
        });
        const pdf = buildPagedPdf(lines, "Kuendigung Altanbieter");
        const stored = await putFile(pdf.toString("base64"), `kuendigung-${contractId}.pdf`);
        await db`
          insert into contract_files (id, contract_id, kind, filename, mime, path)
          values (${nid()}, ${contractId}, ${"kuendigung"}, ${"Kuendigung-Altanbieter.pdf"}, ${"application/pdf"}, ${stored.path})
        `;
        const { gmailAppPasswordReady, sendViaAppPassword } = await import("./smtp-gmail.server");
        if (gmailAppPasswordReady()) {
          const sparteName = String(tariffRow.type) === "gas" ? "Gas" : "Strom";
          await sendViaAppPassword({
            to: `info@e1direktvertrieb.de, ${data.email.trim()}`,
            subject: `Kündigung Altanbieter · ${data.lastName} · ${data.previousProvider || "Lieferant"}`,
            text: [
              `Kündigung ${sparteName} im Auftrag von ${data.firstName} ${data.lastName}.`,
              `Bisheriger Anbieter: ${data.previousProvider || "unbekannt"}`,
              `Lieferstelle: ${data.street} ${data.house}, ${data.zip} ${data.city}`,
              data.previousCustomerNo ? `Kundennummer: ${data.previousCustomerNo}` : "",
              data.meter ? `Zähler: ${data.meter}` : "",
              "",
              "Der Kunde hat „Kündigung übernehmen“ gewählt. Schreiben als PDF im Anhang.",
            ]
              .filter(Boolean)
              .join("\n"),
            filename: "Kuendigung-Altanbieter.pdf",
            pdf,
          });
        }
      } catch {
        /* Datei optional */
      }
    }
    try {
      const { gmailAppPasswordReady, sendViaAppPassword } = await import("./smtp-gmail.server");
      if (gmailAppPasswordReady()) {
        await sendViaAppPassword({
          to: data.email.trim(),
          subject: "Ihre E1-Buchung",
          text: [
            `Guten Tag ${data.firstName} ${data.lastName},`,
            "",
            `wir haben Ihre Buchung ${String(tariffRow.name)} aufgenommen.`,
            "Die Prüfung folgt. Bei Fragen: info@e1direktvertrieb.de",
            "",
            "E1 Direktvertrieb",
          ].join("\n"),
        });
      }
    } catch {
      /* mail optional */
    }
    return { ok: true, id: contractId };
  });
