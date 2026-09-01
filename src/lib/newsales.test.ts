import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapNewsalesStatus, newsalesBody, newsalesConfigured } from "./newsales.ts";

describe("newsales api", () => {
  it("is off without url and key", () => {
    assert.equal(newsalesConfigured({} as NodeJS.ProcessEnv), false);
    assert.equal(
      newsalesConfigured({ NEWSALES_API_URL: "https://api.example", NEWSALES_API_KEY: "k" } as NodeJS.ProcessEnv),
      true,
    );
  });

  it("builds a portal payload for New Sales", () => {
    const body = newsalesBody({
      portalId: "ctr-1",
      advisorId: "u1",
      advisorName: "Luca Marrancone",
      customer: {
        firstName: "Hans",
        lastName: "Müller",
        phone: "0171",
        street: "Hauptstr.",
        houseNumber: "1",
        zip: "50667",
        city: "Köln",
      },
      productName: "Ökostrom 12",
      provider: "NewSales",
      type: "strom",
      consumptionKwh: 3200,
    });
    assert.equal(body.source, "e1-direktvertrieb");
    assert.equal(body.customer.lastName, "Müller");
    assert.equal(body.consumptionKwh, 3200);
    assert.equal(body.ibanMissing, true);
  });

  it("maps New Sales statuses into the portal workflow", () => {
    assert.equal(mapNewsalesStatus("confirmed"), "bestaetigt");
    assert.equal(mapNewsalesStatus("storniert"), "storniert");
    assert.equal(mapNewsalesStatus("foo"), null);
  });
});
