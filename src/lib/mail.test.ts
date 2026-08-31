import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  denySendReason,
  dmarcRecord,
  dnsRecordsFor,
  expectedSpf,
  interpretDkimGoogle,
  interpretDmarcRecord,
  interpretMxGoogle,
  interpretSpfRecord,
  isCompanySender,
  isValidLocalPart,
  mailReady,
  MAIL_PROVIDER,
  nextDmarcPolicy,
  normalizeLocalPart,
  personalLocalPart,
  slugMailPart,
  workspaceLocalPart,
} from "./mail.ts";

describe("personal addresses", () => {
  it("builds vorname.nachname", () => {
    assert.equal(personalLocalPart("Orhan", "Salo"), "orhan.salo");
    assert.equal(personalLocalPart("Luca-Marco", "Marrancone"), "lucamarco.marrancone");
    assert.equal(personalLocalPart("Luca Marco", "Marrancone"), "lucamarco.marrancone");
    assert.equal(personalLocalPart("Jürgen", "Müller"), "juergen.mueller");
    assert.equal(slugMailPart("  E1  "), "e1");
    assert.equal(isValidLocalPart("info"), true);
    assert.equal(isValidLocalPart("orhan.salo"), true);
    assert.equal(isValidLocalPart("luca.marrancone"), true);
    assert.equal(isValidLocalPart("-bad"), false);
    assert.equal(normalizeLocalPart("luca.marrancone"), "luca.marrancone");
    assert.equal(normalizeLocalPart("Info@E1"), "info-e1");
  });

  it("uses the live founder mailbox luca.marrancone@", () => {
    assert.equal(workspaceLocalPart("Orhan", "Salo"), "orhan.salo");
    assert.equal(workspaceLocalPart("Luca-Marco", "Marrancone"), "luca.marrancone");
    assert.equal(workspaceLocalPart("Luca Marco", "Marrancone"), "luca.marrancone");
    assert.equal(workspaceLocalPart("Luca", "Marrancone"), "luca.marrancone");
    assert.equal(workspaceLocalPart("Jonas", "Keller"), "jonas.keller");
  });
});

describe("google workspace spf / dkim / dmarc / mx", () => {
  it("accepts hard-fail SPF for Google only", () => {
    assert.equal(interpretSpfRecord(["v=spf1 include:_spf.google.com -all"]), "ok");
    assert.equal(interpretSpfRecord(["v=spf1 include:_spf.google.com ~all"]), "fehlerhaft");
    assert.equal(interpretSpfRecord(["v=spf1 include:spf.protection.outlook.com -all"]), "fehlerhaft");
    assert.equal(interpretSpfRecord(["hello"]), "fehlt");
  });

  it("requires a real Google DKIM public key or CNAME", () => {
    assert.equal(interpretDkimGoogle([]), "fehlt");
    assert.equal(interpretDkimGoogle(["v=DKIM1; k=rsa; p="]), "fehlerhaft");
    assert.equal(interpretDkimGoogle(["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"]), "ok");
    assert.equal(interpretDkimGoogle([], ["google.com"]), "ok");
  });

  it("requires Google MX and rejects Outlook", () => {
    assert.equal(interpretMxGoogle([]), "fehlt");
    assert.equal(interpretMxGoogle(["aspmx.l.google.com."]), "ok");
    assert.equal(interpretMxGoogle(["e1direktvertrieb-de.mail.protection.outlook.com"]), "fehlerhaft");
  });

  it("reads DMARC policy and treats p=none as a valid start", () => {
    assert.equal(interpretDmarcRecord([]).state, "fehlt");
    const none = interpretDmarcRecord(["v=DMARC1; p=none; rua=mailto:dmarc@e1direktvertrieb.de"]);
    assert.equal(none.state, "ok");
    assert.equal(none.policy, "none");
    assert.equal(interpretDmarcRecord(["v=DMARC1; pct=100"]).state, "fehlerhaft");
    assert.equal(nextDmarcPolicy("none"), "quarantine");
    assert.equal(nextDmarcPolicy("quarantine"), "reject");
    assert.equal(nextDmarcPolicy("reject"), null);
  });
});

describe("send gate and google records", () => {
  it("blocks send until all three are ok", () => {
    assert.equal(mailReady("ok", "ok", "ok"), true);
    assert.equal(mailReady("ok", "fehlt", "ok"), false);
    const reason = denySendReason("fehlt", "ok", "fehlerhaft");
    assert.ok(reason?.includes("SPF fehlt"));
    assert.ok(reason?.includes("DMARC fehlerhaft"));
    assert.equal(denySendReason("ok", "ok", "ok"), null);
  });

  it("prepares Google Workspace SPF / DKIM / DMARC / MX", () => {
    assert.equal(MAIL_PROVIDER, "google_workspace");
    assert.equal(expectedSpf(), "v=spf1 include:_spf.google.com -all");
    const rec = dmarcRecord("none", "dmarc@e1direktvertrieb.de");
    assert.match(rec, /^v=DMARC1; p=none;/);
    assert.match(rec, /rua=mailto:dmarc@e1direktvertrieb.de/);
    assert.match(rec, /ruf=mailto:orhan.salo@e1direktvertrieb.de,mailto:luca.marrancone@e1direktvertrieb.de/);
    assert.match(rec, /adkim=s; aspf=s/);
    const goog = dnsRecordsFor();
    assert.ok(goog.some((r) => r.value.includes("_spf.google.com") && r.value.endsWith("-all")));
    assert.equal(goog.filter((r) => r.purpose === "mx").length, 5);
    assert.ok(!goog.some((r) => r.value.includes("outlook")));
    assert.ok(isCompanySender("info@e1direktvertrieb.de"));
    assert.equal(isCompanySender("info@gmail.com"), false);
  });
});
