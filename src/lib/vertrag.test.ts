import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillVertrag, requiredClauses } from "./vertrag.ts";
import { buildPagedPdf } from "./sign.ts";

describe("vertrag", () => {
  it("contains german-law clauses and price placeholders", () => {
    const lines = fillVertrag({
      art: "strom",
      first: "Max",
      last: "Mustermann",
      street: "Musterweg",
      house: "1",
      zip: "10115",
      city: "Berlin",
      email: "max@example.de",
      phone: "030123",
      product: "",
      kwh: "",
      advisor: "Orhan Salo",
    }).join("\n");
    for (const c of requiredClauses()) assert.ok(lines.includes(c), c);
    assert.ok(lines.includes("Max Mustermann"));
    assert.ok(lines.includes("STROMLIEFERVERTRAG"));
    assert.ok(lines.includes("Haushaltskunde"));
    assert.ok(lines.includes("ALLGEMEINE GESCHÄFTSBEDINGUNGEN") || lines.includes("ALLGEMEINE GESCH"));
    assert.ok(lines.includes("Schlichtungsstelle"));
  });

  it("builds a multi-page pdf", () => {
    const pdf = buildPagedPdf(fillVertrag({
      art: "gas",
      first: "A",
      last: "B",
      street: "S",
      house: "2",
      zip: "80331",
      city: "München",
      email: "a@b.de",
      phone: "089",
      product: "Gas",
      kwh: "12000",
      advisor: "Luca Marco Marrancone",
    }));
    const t = pdf.toString("latin1");
    assert.ok(t.startsWith("%PDF-1.4"));
    assert.ok(t.includes("/Count "));
    assert.ok(t.includes("/sign1/"));
  });
});
