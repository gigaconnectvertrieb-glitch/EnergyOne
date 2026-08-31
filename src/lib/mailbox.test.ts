import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canReadSharedMailbox,
  canSendSharedMailbox,
  denyMailboxSend,
  extractEmails,
  forwardSubject,
  matchInbound,
  replySubject,
  snippetOf,
} from "./mailbox.ts";

const index = {
  customers: [
    {
      id: "cus-1",
      email: "hans.mueller@example.de",
      first_name: "Hans",
      last_name: "Müller",
      zip: "10435",
      phone: "030 998877",
    },
  ],
  contracts: [{ id: "ctr-1", customer_id: "cus-1" }],
  leads: [{ id: "lead-1", name: "Familie Dorn", phone: "0172 4445566" }],
  applications: [
    { id: "app-1", email: "felix.brandt@example.de", first_name: "Felix", last_name: "Brandt" },
  ],
};

describe("mailbox rights", () => {
  it("lets staff send from personal, shared only with role", () => {
    assert.equal(canSendSharedMailbox("vertrieb", "info"), false);
    assert.equal(canSendSharedMailbox("backoffice", "info"), true);
    assert.equal(canSendSharedMailbox("backoffice", "business"), false);
    assert.equal(canReadSharedMailbox("teamleiter", "info"), true);
    assert.equal(denyMailboxSend("info", "vertrieb", false)?.includes("Senderecht"), true);
    assert.equal(denyMailboxSend("orhan.salo", "vertrieb", true), null);
  });
});

describe("matching", () => {
  it("matches customer email, contract id, lead phone, application", () => {
    const byMail = matchInbound(
      { from: "Hans Müller <hans.mueller@example.de>", to: "info@e1direktvertrieb.de", subject: "Start", body: "Hallo" },
      index,
    );
    assert.equal(byMail.customer_id, "cus-1");
    assert.equal(byMail.contract_id, "ctr-1");

    const byId = matchInbound(
      { from: "x@y.de", to: "info@e1direktvertrieb.de", subject: "Zu ctr-1", body: "" },
      index,
    );
    assert.equal(byId.contract_id, "ctr-1");

    const byLead = matchInbound(
      { from: "a@b.de", to: "info@e1direktvertrieb.de", subject: "Rückruf", body: "Bitte 0172 4445566 anrufen" },
      index,
    );
    assert.equal(byLead.lead_id, "lead-1");

    const byApp = matchInbound(
      { from: "felix.brandt@example.de", to: "bewerbung@e1direktvertrieb.de", subject: "Bewerbung", body: "" },
      index,
    );
    assert.equal(byApp.application_id, "app-1");
  });

  it("extracts emails and prefixes replies", () => {
    assert.deepEqual(extractEmails("Von: A <A.B@E1.de> an info@e1direktvertrieb.de"), [
      "a.b@e1.de",
      "info@e1direktvertrieb.de",
    ]);
    assert.equal(replySubject("Starttermin"), "Re: Starttermin");
    assert.equal(replySubject("Re: Starttermin"), "Re: Starttermin");
    assert.equal(forwardSubject("Rechnung"), "WG: Rechnung");
    assert.equal(snippetOf("abc", 10), "abc");
  });
});
