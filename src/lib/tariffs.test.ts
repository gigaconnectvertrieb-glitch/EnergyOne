import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clampStufe, commissionFromBand, matchBand } from "./tariffs.ts";

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
    assert.equal(clampStufe(9), 1);
  });
});
