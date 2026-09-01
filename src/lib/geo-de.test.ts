import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyWalkOrder, bboxAround, groupStreets, planHouseWalk, planWorkdays, pointInPolygon, searchDeCities, uniqueStreets } from "./geo-de.ts";

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

  it("orders streets then house numbers from a start point", () => {
    const walk = planHouseWalk(
      [
        { id: "a", lat: 49.7, lng: 8.45, street: "Hauptstraße", house: "12" },
        { id: "b", lat: 49.7002, lng: 8.4502, street: "Hauptstraße", house: "14" },
        { id: "c", lat: 49.71, lng: 8.46, street: "Nebenweg", house: "1" },
      ],
      { lat: 49.699, lng: 8.449 },
    );
    assert.equal(walk.streets[0].street, "Hauptstraße");
    assert.equal(walk.streets[0].houses[0].house, "12");
    assert.equal(walk.count, 3);
  });

  it("lets staff reorder streets", () => {
    const walk = planHouseWalk(
      [
        { id: "a", lat: 49.7, lng: 8.45, street: "A-Straße", house: "1" },
        { id: "b", lat: 49.71, lng: 8.46, street: "B-Straße", house: "2" },
      ],
      { lat: 49.69, lng: 8.44 },
    );
    const swapped = applyWalkOrder(walk, [{ street: "B-Straße" }, { street: "A-Straße" }]);
    assert.equal(swapped.streets[0].street, "B-Straße");
    assert.equal(swapped.streets[1].street, "A-Straße");
  });

  it("lists streets A-Z with numeric houses, no walk", () => {
    const g = groupStreets([
      { id: "a", lat: 49.7, lng: 8.45, street: "Nebenweg", house: "10" },
      { id: "b", lat: 49.7, lng: 8.45, street: "Hauptstraße", house: "12a" },
      { id: "c", lat: 49.7, lng: 8.45, street: "Hauptstraße", house: "2" },
    ]);
    assert.equal(g[0]!.street, "Hauptstraße");
    assert.equal(g[0]!.houses.map((h) => h.house).join(","), "2,12a");
    assert.equal(g[1]!.street, "Nebenweg");
  });
});
