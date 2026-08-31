import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bboxAround, planWorkdays, pointInPolygon, searchDeCities, uniqueStreets } from "./geo-de.ts";

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

  it("accepts triangle and rectangle zones", () => {
    const tri = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    assert.equal(pointInPolygon({ lat: 0.4, lng: 0.4 }, tri), true);
    assert.equal(pointInPolygon({ lat: 2, lng: 2 }, tri), false);
    const rect = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    assert.equal(pointInPolygon({ lat: 1, lng: 1 }, rect), true);
    assert.equal(pointInPolygon({ lat: 3, lng: 1 }, rect), false);
  });

  it("merges OSM segments of the same street", () => {
    const u = uniqueStreets([
      { id: "1", lat: 49.69, lng: 8.45, street: "Berliner Straße" },
      { id: "2", lat: 49.691, lng: 8.451, street: "Berliner Straße" },
      { id: "3", lat: 49.692, lng: 8.452, street: "Bei den Münchäckern" },
    ]);
    assert.equal(u.length, 2);
    assert.equal(u.some((s) => s.street === "Berliner Straße"), true);
  });
});
