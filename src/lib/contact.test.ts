import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, telHref } from "./contact.ts";

describe("contact", () => {
  it("builds a tel link", () => {
    assert.equal(telHref("030 12345678"), "tel:03012345678");
    assert.equal(telHref("+49 30 12345678"), "tel:+493012345678");
    assert.equal(telHref(""), "");
  });

  it("formats german numbers loosely", () => {
    assert.equal(formatPhone(""), "");
    assert.match(formatPhone("03012345678"), /030/);
  });
});
