import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillHvVertrag } from "./hv-vertrag.ts";

describe("handelsvertretervertrag", () => {
  const lines = fillHvVertrag({
    first: "Max",
    last: "Muster",
    street: "Hauptstr.",
    house: "1",
    zip: "80331",
    city: "München",
    staffId: "max.muster",
    stufe: 1,
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
    assert.match(lines, /§ 348 HGB/);
    assert.match(lines, /5.000 EUR/);
    assert.match(lines, /Freistellung/);
    assert.match(lines, /\/sign1\//);
  });
});
