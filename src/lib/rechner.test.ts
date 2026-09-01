import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcSavings, yearCost } from "./rechner.ts";

describe("rechner", () => {
  it("computes yearly cost", () => {
    assert.equal(yearCost(3500, 40, 120), 1520);
  });

  it("shows a saving when the compare tariff is cheaper", () => {
    const r = calcSavings({
      kind: "privat",
      sparte: "strom",
      kwh: 3500,
      currentArbeitCt: 40,
      currentGrundEurYear: 120,
      compare: { arbeitCt: 29.5, grundEurYear: 144, label: "x" },
    });
    assert.equal(r.ok, true);
    assert.equal(r.currentYear, 1520);
    assert.ok(r.saveYear > 0);
  });

  it("needs consumption and a current price", () => {
    const r = calcSavings({
      kind: "privat",
      sparte: "strom",
      kwh: 0,
      currentArbeitCt: 0,
      currentGrundEurYear: 0,
      compare: { arbeitCt: 29.5, grundEurYear: 144, label: "x" },
    });
    assert.equal(r.ok, false);
  });
});
