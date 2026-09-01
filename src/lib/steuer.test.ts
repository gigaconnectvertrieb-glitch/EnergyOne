import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  annualizeExpense,
  baAmount,
  elsterCsv,
  leftover,
  nextVatDeadline,
  payoutHintText,
  payoutSetAside,
  splitMoney,
  ustVa,
  vatOn,
  vatQuarter,
} from "./steuer.ts";

describe("steuer", () => {
  it("splits 19 percent vat", () => {
    const s = splitMoney(119, 0.19, true);
    assert.ok(Math.abs(s.net - 100) < 0.01);
    assert.ok(Math.abs(s.vat - 19) < 0.01);
  });
  it("counts bewirtung at 70 percent BA", () => {
    assert.equal(baAmount("bewirtung", 100), 70);
    assert.equal(baAmount("krankenkasse", 200), 0);
  });
  it("keeps leftover after tax reserve; USt sits on top of net", () => {
    assert.equal(leftover({ proviPaid: 1000, expensesCash: 200, ustSetAside: 100, estSetAside: 50 }), 750);
    assert.equal(
      leftover({ proviPaid: 1000, expensesCash: 200, ustSetAside: 100, estSetAside: 50, vatOnTop: false }),
      650,
    );
  });
  it("sets vat deadline after quarter", () => {
    const d = nextVatDeadline(new Date("2026-05-02T12:00:00"), false);
    assert.equal(d.getMonth(), 6);
    assert.equal(d.getDate(), 10);
  });
  it("builds elster kennziffern", () => {
    const q = vatQuarter(new Date("2026-05-02T12:00:00"));
    assert.equal(q.label, "Q2 2026");
    const v = ustVa(1000, 19);
    assert.equal(v.kz81, 1000);
    assert.equal(v.kz66, 19);
    assert.equal(v.kz83, 171);
    assert.match(elsterCsv({ name: "Max", quarter: q.label, kz81: v.kz81, kz66: v.kz66, kz83: v.kz83 }), /81/);
  });
  it("annualizes monthly fixkosten", () => {
    assert.equal(annualizeExpense(200, "monat"), 2400);
    assert.equal(annualizeExpense(900, "jahr"), 900);
    assert.equal(annualizeExpense(50, "einmal"), 50);
  });
  it("adds 19 percent on top of net list amounts", () => {
    const v = vatOn(160);
    assert.equal(v.net, 160);
    assert.equal(v.vat, 30.4);
    assert.equal(v.gross, 190.4);
    const s = vatOn(86);
    assert.equal(s.vat, 16.34);
    assert.equal(s.gross, 102.34);
  });
  it("tells staff how much to set aside on payout", () => {
    const a = payoutSetAside({
      payout: 160,
      paidYtd: 0,
      kleinunternehmer: false,
      monthlyFix: 40,
      yearlyBa: 480,
    });
    assert.equal(a.ust, 30.4);
    assert.equal(a.gross, 190.4);
    assert.equal(a.net, 160);
    assert.equal(a.fix, 40);
    assert.equal(a.keep, 120);
    assert.match(payoutHintText(160, a), /netto/);
    assert.match(payoutHintText(160, a), /brutto/);
    assert.match(payoutHintText(160, a), /USt/);
  });
});