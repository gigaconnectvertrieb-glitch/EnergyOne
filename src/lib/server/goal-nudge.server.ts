import type { Sql } from "@/lib/db";
import { asPeriod, clampGoal, goalProgress, nudgeCopy, pickNudgeKinds } from "@/lib/goals";
import { nid, num } from "@/lib/utils";
import { notify } from "./helpers";
import { hasSubscription, sendPushToUser, vapidPublicKey } from "./push.server";

export async function loadGoalRow(db: Sql, userId: string) {
  const [row] = await db<{
    revenue_goal_eur: string;
    revenue_goal_period: string;
    goal_nudge: boolean;
  }>`
    select revenue_goal_eur, revenue_goal_period, goal_nudge
    from profiles where user_id = ${userId}
  `;
  return {
    target: clampGoal(row?.revenue_goal_eur),
    period: asPeriod(row?.revenue_goal_period),
    nudge: row?.goal_nudge !== false,
  };
}

export async function earnedInPeriod(db: Sql, userId: string, start: string, endExclusive: string) {
  const [row] = await db<{ v: string; n: number }>`
    select
      coalesce(sum(coalesce(advisor_amount, commission_amount)), 0)::text as v,
      count(*)::int as n
    from contracts
    where user_id = ${userId}
      and status <> 'storniert'
      and created_at >= ${start}::date
      and created_at < ${endExclusive}::date
  `;
  return { earned: num(row?.v), deals: num(row?.n) };
}

export async function goalPayload(db: Sql, userId: string) {
  const goal = await loadGoalRow(db, userId);
  const skeleton = goalProgress({ target: goal.target, earned: 0, period: goal.period });
  const { earned, deals } = await earnedInPeriod(db, userId, skeleton.start, skeleton.endExclusive);
  const live = goalProgress({ target: goal.target, earned, period: goal.period });
  return {
    ...live,
    deals,
    nudge: goal.nudge,
    pushOn: await hasSubscription(db, userId),
    vapidPublic: await vapidPublicKey(db),
  };
}

export async function runGoalNudges(db: Sql, userId: string, now = new Date()) {
  const goal = await loadGoalRow(db, userId);
  if (!goal.nudge || goal.target <= 0) return { sent: [] as string[] };
  const bounds = goalProgress({ target: goal.target, earned: 0, period: goal.period, now });
  const { earned } = await earnedInPeriod(db, userId, bounds.start, bounds.endExclusive);
  const progress = goalProgress({ target: goal.target, earned, period: goal.period, now });
  const kinds = pickNudgeKinds(progress, { nudge: true });
  const sent: string[] = [];
  for (const kind of kinds) {
    const inserted = await db<{ id: string }>`
      insert into goal_nudges (id, user_id, period_key, kind)
      values (${nid()}, ${userId}, ${progress.periodKey}, ${kind})
      on conflict (user_id, period_key, kind) do nothing
      returning id
    `;
    if (!inserted[0]) continue;
    const copy = nudgeCopy(kind, progress);
    await notify(db, {
      userId,
      type: "goal",
      title: copy.title,
      message: copy.message,
      link: "/app",
    });
    try {
      await sendPushToUser(db, userId, { title: copy.title, body: copy.message, url: "/app" });
    } catch {
      /* Push ist Zusatz */
    }
    sent.push(kind);
  }
  return { sent };
}
