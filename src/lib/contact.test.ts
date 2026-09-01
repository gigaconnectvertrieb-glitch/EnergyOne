import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, telHref } from "./contact.ts";

describe("contact", () => {
  it("builds a tel link for the sipgate number", () => {
    assert.equal(telHref("015678954406"), "tel:+4915678954406");
    assert.equal(telHref(""), "");
  });

  it("formats the public number", () => {
    assert.equal(formatPhone("015678954406"), "0156 78954406");
    assert.equal(formatPhone(""), "");
  });
});
