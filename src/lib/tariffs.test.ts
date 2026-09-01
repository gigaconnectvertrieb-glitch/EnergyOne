import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clampStufe, commissionFromBand, matchBand, splitDeal } from "./tariffs.ts";

const list = JSON.parse(readFileSync(new URL("../data/provisions.json", import.meta.url), "utf8")) as Array<{
  id: string;
  external_id: string;
  type: string;
  bands: Array<{ stufe: number; kwh_from: number; kwh_to: number; amount_eur: number; amount_ct_kwh: number }>;
}>;

describe("tariff list", () => {
  it("loads 316 tariffs and 3 stufen", () => {
    assert.equal(list.length, 316);
    const badenova = list.find((t) => t.external_id === "20069");
    assert.ok(badenova);
    assert.equal(badenova.type, "gas");
    const band = matchBand(badenova.bands, 1, 3000);
    assert.equal(band?.amount_eur, 76);
    assert.equal(commissionFromBand(band!, 3000), 76);
    const eon = list.find((t) => t.external_id === "18611");
    assert.equal(matchBand(eon!.bands, 2, 500)?.amount_eur, 24.14);
    assert.equal(matchBand(eon!.bands, 2, 5000)?.amount_eur, 84);
    assert.equal(matchBand(eon!.bands, 2, 9_000_000), null);
    assert.equal(clampStufe(3), 3);
    assert.equal(clampStufe(13), 13);
    assert.equal(clampStufe(9), 1);
  });

  it("splits agency 160 vs staff 86", () => {
    const bands = [
      { stufe: 13, kwh_from: 1, kwh_to: 100000, amount_eur: 160, amount_ct_kwh: 0 },
      { stufe: 1, kwh_from: 1, kwh_to: 100000, amount_eur: 86, amount_ct_kwh: 0 },
    ];
    const d = splitDeal(bands, 1, 3500);
    assert.equal(d.agency, 160);
    assert.equal(d.advisor, 86);
    assert.equal(d.margin, 74);
    const gf = splitDeal(bands, 13, 3500);
    assert.equal(gf.advisor, 160);
    assert.equal(gf.margin, 0);
  });

  it("derives staff share when only agency band exists", () => {
    const bands = [{ stufe: 13, kwh_from: 1, kwh_to: 100000, amount_eur: 160, amount_ct_kwh: 0 }];
    const d = splitDeal(bands, 1, 3500);
    assert.equal(d.agency, 160);
    assert.equal(d.advisor, 86.4);
    assert.equal(d.margin, 73.6);
    const s2 = splitDeal(bands, 2, 3500);
    assert.equal(s2.advisor, 115.2);
    assert.equal(s2.margin, 44.8);
  });
});
