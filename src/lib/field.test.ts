import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  followupDays,
  needsFollowup,
  parseTerritoryFile,
  sortWeekly,
  weekKey,
  osrmUrl,
} from "./field.ts";

describe("field", () => {
  it("marks not-home and laufzeit for follow-up", () => {
    assert.equal(needsFollowup("nicht_angetroffen"), true);
    assert.equal(needsFollowup("laufzeit_passt_nicht"), true);
    assert.equal(needsFollowup("abschluss"), false);
    assert.equal(followupDays("laufzeit_passt_nicht"), 30);
    assert.equal(followupDays("nicht_angetroffen"), 7);
  });

  it("parses csv doors", () => {
    const csv = "street;house;zip;city;lat;lng\nKastanienallee;12;10435;Berlin;52.5389;13.4094\n";
    const t = parseTerritoryFile("berlin.csv", csv);
    assert.equal(t.doors.length, 1);
    assert.equal(t.doors[0].street, "Kastanienallee");
    assert.ok(t.center.lat > 52);
  });

  it("parses geojson points", () => {
    const geo = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [13.4, 52.52] },
          properties: { street: "Test", house: "1", zip: "10115", city: "Berlin" },
        },
      ],
    });
    const t = parseTerritoryFile("mitte.geojson", geo);
    assert.equal(t.doors[0].city, "Berlin");
    assert.equal(t.doors[0].lng, 13.4);
  });

  it("sorts weekly list by reason", () => {
    const rows = sortWeekly([
      { reason: "spaeter", follow_up_on: "2026-09-10" },
      { reason: "nicht_angetroffen", follow_up_on: "2026-09-08" },
      { reason: "laufzeit_passt_nicht", follow_up_on: "2026-09-01" },
    ]);
    assert.equal(rows[0].reason, "nicht_angetroffen");
    assert.equal(rows[1].reason, "laufzeit_passt_nicht");
  });

  it("builds osrm url", () => {
    const url = osrmUrl([
      { lat: 52.52, lng: 13.4 },
      { lat: 52.53, lng: 13.41 },
    ]);
    assert.match(url, /router.project-osrm.org/);
    assert.match(url, /13.4,52.52/);
  });

  it("week key format", () => {
    assert.match(weekKey(new Date("2026-08-31")), /^2026-W\d{2}$/);
  });
});
