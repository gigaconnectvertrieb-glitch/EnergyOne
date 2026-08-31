import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillHvAnlage1, fillHvVertrag, formatHvBandLine } from "./hv-vertrag.ts";

describe("handelsvertretervertrag", () => {
  const bands = [
    {
      provider: "E1",
      name: "E1 Strom Fair",
      type: "strom",
      kwh_from: 0,
      kwh_to: 2500,
      amount_eur: 90,
      amount_ct_kwh: 0,
    },
  ];
  const lines = fillHvVertrag({
    first: "Max",
    last: "Muster",
    street: "Hauptstr.",
    house: "1",
    zip: "80331",
    city: "München",
    staffId: "max.muster",
    stufe: 1,
    bands,
  }).join("\n");

  it("is self-employed HV under HGB with stufe 1 and 14-day clawback", () => {
    assert.match(lines, /§ 84/);
    assert.match(lines, /kein Arbeitsverhältnis/i);
    assert.match(lines, /Stufe 1/);
    assert.match(lines, /Zusatzvereinbarung/);
    assert.match(lines, /14 Tagen/);
    assert.match(lines, /§ 89b/);
    assert.match(lines, /Orhan Salo/);
    assert.match(lines, /Luca-Marco Marrancone/);
    assert.match(lines, /Max Muster/);
    assert.match(lines, /Provisionsordnung/);
    assert.match(lines, /Vertragsstrafen/);
    assert.match(lines, /per E-Mail/i);
    assert.doesNotMatch(lines, /90,00 EUR/);
    assert.doesNotMatch(lines, /E1 Strom Fair/);
  });

  it("keeps amounts only on the emailed sheet", () => {
    assert.match(formatHvBandLine(bands[0]!), /90,00 EUR/);
    const anlage = fillHvAnlage1(bands, 1).join("\n");
    assert.match(anlage, /Anzahl Positionen Stufe 1: 1/);
    assert.match(anlage, /E1 Strom Fair/);
  });
});
