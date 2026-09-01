import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import { asPeriod, clampGoal, goalProgress } from "@/lib/goals";
import { asStr, num } from "@/lib/utils";
import { goalPayload, runGoalNudges } from "./goal-nudge.server";
import { requireProfile, sql, visibleUserIds } from "./helpers";
import { dropSubscription, saveSubscription } from "./push.server";

export const getMyGoal = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    try {
      await runGoalNudges(db, context.userId);
    } catch {
      /* Anzeige zuerst */
    }
    return goalPayload(db, context.userId);
  });

export const setMyGoal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { targetEur: number; period?: "week" | "month" | "year" | "total"; nudge?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    const target = clampGoal(data.targetEur);
    const period = asPeriod(data.period);
    const nudge = data.nudge !== false;
    await db`
      update profiles set
        revenue_goal_eur = ${target},
        revenue_goal_period = ${period},
        goal_nudge = ${nudge}
      where user_id = ${context.userId}
    `;
    try {
      await runGoalNudges(db, context.userId);
    } catch {
      /* ok */
    }
    return goalPayload(db, context.userId);
  });

export const savePush = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; userAgent?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    await saveSubscription(db, context.userId, data, data.userAgent);
    return { ok: true };
  });

export const disablePush = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { endpoint?: string } = {}) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await dropSubscription(db, context.userId, data.endpoint);
    return { ok: true };
  });

export const getTeamGoals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view") && !can(me.role, "users.manage")) {
      return [] as Array<{ user_id: string; name: string; period: string; target: number; earned: number; pct: number }>;
    }
    const ids = can(me.role, "users.manage") ? null : await visibleUserIds(db, me);
    const month = goalProgress({ target: 1, earned: 0, period: "month" });
    const week = goalProgress({ target: 1, earned: 0, period: "week" });
    const year = goalProgress({ target: 1, earned: 0, period: "year" });
    const rows = ids
      ? await db<Record<string, unknown>>`
          select p.user_id, p.first_name, p.last_name, p.revenue_goal_eur, p.revenue_goal_period,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert'
            ), 0)::text as earned_all,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert' and c.created_at >= ${year.start}::date and c.created_at < ${year.endExclusive}::date
            ), 0)::text as earned_year,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert' and c.created_at >= ${month.start}::date and c.created_at < ${month.endExclusive}::date
            ), 0)::text as earned_month,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert' and c.created_at >= ${week.start}::date and c.created_at < ${week.endExclusive}::date
            ), 0)::text as earned_week
          from profiles p
          left join contracts c on c.user_id = p.user_id
          where p.status = 'active' and coalesce(p.is_demo, false) = false and p.user_id = any(${ids})
          group by p.user_id, p.first_name, p.last_name, p.revenue_goal_eur, p.revenue_goal_period
          order by p.last_name, p.first_name
        `
      : await db<Record<string, unknown>>`
          select p.user_id, p.first_name, p.last_name, p.revenue_goal_eur, p.revenue_goal_period,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert'
            ), 0)::text as earned_all,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert' and c.created_at >= ${year.start}::date and c.created_at < ${year.endExclusive}::date
            ), 0)::text as earned_year,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert' and c.created_at >= ${month.start}::date and c.created_at < ${month.endExclusive}::date
            ), 0)::text as earned_month,
            coalesce(sum(coalesce(c.advisor_amount, c.commission_amount)) filter (
              where c.status <> 'storniert' and c.created_at >= ${week.start}::date and c.created_at < ${week.endExclusive}::date
            ), 0)::text as earned_week
          from profiles p
          left join contracts c on c.user_id = p.user_id
          where p.status = 'active' and coalesce(p.is_demo, false) = false
            and p.role in ('vertrieb','partner','teamleiter','gebietsleiter','super_admin')
          group by p.user_id, p.first_name, p.last_name, p.revenue_goal_eur, p.revenue_goal_period
          order by p.last_name, p.first_name
        `;
    return rows.map((r) => {
      const target = clampGoal(r.revenue_goal_eur);
      const period = asPeriod(r.revenue_goal_period);
      const earned =
        period === "week"
          ? num(r.earned_week)
          : period === "year"
            ? num(r.earned_year)
            : period === "total"
              ? num(r.earned_all)
              : num(r.earned_month);
      const pct = target > 0 ? Math.min(999, Math.round((earned / target) * 1000) / 10) : 0;
      return {
        user_id: asStr(r.user_id),
        name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
        period: asPeriod(r.revenue_goal_period),
        target,
        earned,
        pct,
      };
    });
  });
