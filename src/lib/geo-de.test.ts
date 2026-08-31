import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bboxAround, planWorkdays, searchDeCities } from "./geo-de.ts";

describe("geo-de", () => {
  it("finds german cities", () => {
    const hits = searchDeCities("köln");
    assert.equal(hits[0].name, "Köln");
    assert.ok(searchDeCities("Berlin").length >= 1);
    assert.equal(searchDeCities("x").length, 0);
  });

  it("builds nearest-neighbor day plans", () => {
    const stops = [
      { id: "a", lat: 50.94, lng: 6.96, street: "A" },
      { id: "b", lat: 50.941, lng: 6.961, street: "B" },
      { id: "c", lat: 51.5, lng: 7.5, street: "C" },
      { id: "d", lat: 51.501, lng: 7.501, street: "D" },
    ];
    const days = planWorkdays(stops, 2);
    assert.equal(days.length, 2);
    assert.equal(days[0].stops.length, 2);
    assert.equal(days[1].stops.length, 2);
  });

  it("bbox is around the city", () => {
    const b = bboxAround(52.52, 13.405, 2);
    assert.ok(b.south < 52.52 && b.north > 52.52);
    assert.ok(b.west < 13.405 && b.east > 13.405);
  });
});
