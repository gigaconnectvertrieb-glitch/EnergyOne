import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildContractPdf,
  shouldImportSignedPdf,
  signEventToStatus,
} from "./sign.ts";

describe("sign", () => {
  it("maps docusign events", () => {
    assert.equal(signEventToStatus("envelope-completed"), "completed");
    assert.equal(signEventToStatus("recipient-completed"), "completed");
    assert.equal(signEventToStatus("envelope-declined"), "declined");
    assert.equal(signEventToStatus("envelope-sent"), "sent");
    assert.equal(signEventToStatus("noop"), null);
  });

  it("imports only completed envelopes", () => {
    assert.equal(shouldImportSignedPdf("completed"), true);
    assert.equal(shouldImportSignedPdf("sent"), false);
  });

  it("builds a pdf with sign anchor", () => {
    const buf = buildContractPdf(["Kunde: Max Mustermann", "Tarif: Strom"]);
    const text = buf.toString("latin1");
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.ok(text.includes("/sign1/"));
    assert.ok(text.includes("Max Mustermann"));
  });
});
