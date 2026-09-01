import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optionalIban } from "./iban.ts";

describe("iban", () => {
  it("allows empty so the contract still submits", () => {
    assert.equal(optionalIban(""), "");
    assert.equal(optionalIban("   "), "");
    assert.equal(optionalIban(undefined), "");
  });

  it("accepts a real IBAN", () => {
    assert.equal(optionalIban("de89 3704 0044 0532 0130 00"), "DE89370400440532013000");
  });

  it("rejects garbage", () => {
    assert.throws(() => optionalIban("123"), /ungültig/);
  });
});
