import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  csvTable,
  laterCommission,
  newsalesPackage,
  qualityVerdict,
  stornoRate,
} from "./ops.ts";

describe("ops", () => {
  it("computes quality verdicts", () => {
    assert.equal(qualityVerdict(2, 2), "ok");
    assert.equal(qualityVerdict(10, 1), "ok");
    assert.equal(qualityVerdict(10, 3), "warn");
    assert.equal(qualityVerdict(10, 4), "block");
    assert.equal(stornoRate(0, 1), 0);
  });

  it("builds a New Sales package without API", () => {
    const text = newsalesPackage({
      id: "ctr-1",
      type: "strom",
      product_name: "New Sales Ökostrom 12",
      provider: "NewSales",
      consumption_kwh: 3200,
      meter_number: "1DE000",
      previous_provider: "Vattenfall",
      start_date: "2026-09-01",
      iban: "DE89370400440532013000",
      bank_owner: "Hans Müller",
      sepa: true,
      privacy: true,
      signature: true,
      notes: "",
      advisor: "Jonas Keller",
      customer: {
        first_name: "Hans",
        last_name: "Müller",
        email: "hans@example.de",
        phone: "030",
        street: "Kastanienallee",
        house_number: "12",
        zip: "10435",
        city: "Berlin",
        birth_date: "1978-04-12",
      },
    });
    assert.match(text, /keine API/);
    assert.match(text, /ctr-1/);
    assert.match(text, /Hans Müller/);
  });

  it("creates folge/bestand only with amount", () => {
    assert.equal(laterCommission("folge", 0), null);
    assert.deepEqual(laterCommission("bestand", 20), { type: "bestand", amount: 20 });
  });

  it("escapes csv", () => {
    const csv = csvTable(["A", "B"], [["x", 'a;b"c']]);
    assert.equal(csv.split("\n")[1], 'x;"a;b""c"');
  });
});
