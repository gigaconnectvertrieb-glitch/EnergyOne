import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  asPeriod,
  clampGoal,
  goalProgress,
  isoWeekKey,
  nudgeCopy,
  periodBounds,
  pickNudgeKinds,
} from "./goals.ts";

describe("goals", () => {
  it("clamps and period", () => {
    assert.equal(clampGoal(-3), 0);
    assert.equal(clampGoal(8000.4), 8000);
    assert.equal(clampGoal(2e9), 1_000_000);
    assert.equal(asPeriod("week"), "week");
    assert.equal(asPeriod("x"), "month");
  });

  it("iso week around year start", () => {
    assert.equal(isoWeekKey(2026, 1, 1), "2026-W01");
    assert.equal(isoWeekKey(2026, 9, 1), "2026-W36");
  });

  it("month progress and remaining", () => {
    const p = goalProgress({
      target: 8000,
      earned: 2000,
      period: "month",
      now: new Date("2026-09-10T10:00:00+02:00"),
    });
    assert.equal(p.periodKey, "2026-09");
    assert.equal(p.start, "2026-09-01");
    assert.equal(p.endExclusive, "2026-10-01");
    assert.equal(p.remaining, 6000);
    assert.equal(p.pct, 25);
    assert.equal(p.daysTotal, 30);
    assert.equal(p.daysLeft, 20);
    assert.ok(p.expected > 0);
    assert.equal(p.periodLabel.includes("September"), true);
  });

  it("picks morning and first-quarter on 10 Sep 10:00", () => {
    const p = goalProgress({
      target: 8000,
      earned: 2000,
      period: "month",
      now: new Date("2026-09-10T10:00:00+02:00"),
    });
    const kinds = pickNudgeKinds(p, { nudge: true });
    assert.ok(kinds.includes("p25"));
    assert.ok(kinds.includes("morning"));
    assert.equal(kinds.includes("hit"), false);
    assert.equal(pickNudgeKinds(p, { nudge: false }).length, 0);
  });

  it("hit at or over target", () => {
    const p = goalProgress({
      target: 17000,
      earned: 17100,
      period: "month",
      now: new Date("2026-09-20T19:00:00+02:00"),
    });
    assert.deepEqual(pickNudgeKinds(p, { nudge: true }), ["hit"]);
    assert.equal(nudgeCopy("hit", p).title, "Ziel erreicht.");
  });

  it("week bounds monday to monday", () => {
    const b = periodBounds("week", new Date("2026-09-02T08:00:00+02:00"));
    assert.equal(b.start, "2026-08-31");
    assert.equal(b.endExclusive, "2026-09-07");
    assert.equal(b.daysTotal, 7);
  });
});
