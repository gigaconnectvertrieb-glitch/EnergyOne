import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPain001 } from "./sepa.ts";

describe("sepa pain.001", () => {
  it("builds a mass credit transfer", () => {
    const xml = buildPain001({
      messageId: "E1-KW36",
      created: new Date("2026-09-01T12:00:00Z"),
      executionDate: "2026-09-05",
      debtorName: "E1 Direktvertrieb",
      debtorIban: "DE89370400440532013000",
      credits: [
        { name: "Max Mustermann", iban: "DE02120300000000202051", amount: 86, remittance: "Provision KW 36" },
        { name: "Ohne IBAN", iban: "", amount: 50, remittance: "x" },
      ],
    });
    assert.match(xml, /pain.001.001.03/);
    assert.match(xml, /<NbOfTxs>1<\/NbOfTxs>/);
    assert.match(xml, /<CtrlSum>86.00<\/CtrlSum>/);
    assert.match(xml, /DE02120300000000202051/);
    assert.doesNotMatch(xml, /Ohne IBAN/);
  });

  it("refuses without company IBAN", () => {
    assert.throws(
      () =>
        buildPain001({
          messageId: "x",
          executionDate: "2026-09-05",
          debtorName: "E1",
          debtorIban: "",
          credits: [{ name: "A", iban: "DE02120300000000202051", amount: 1, remittance: "p" }],
        }),
      /Firmen-IBAN/,
    );
  });
});
