import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import { asStr } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";
import { sendPushToUser } from "./push.server";

export const getBuild = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const db = await sql();
    const [row] = await db<{ value: string }>`select value from settings where key = 'app_build'`;
    const [note] = await db<{ value: string }>`select value from settings where key = 'app_build_note'`;
    return { build: asStr(row?.value) || "1", note: asStr(note?.value) };
  });

export const publishBuild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { note?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Kein Zugriff");
    const [row] = await db<{ value: string }>`select value from settings where key = 'app_build'`;
    const next = String((Number(row?.value) || 1) + 1);
    await db`
      insert into settings (key, value) values ('app_build', ${next})
      on conflict (key) do update set value = ${next}
    `;
    await db`
      insert into settings (key, value) values ('app_build_note', ${data.note || "Neue Version"})
      on conflict (key) do update set value = ${data.note || "Neue Version"}
    `;
    const users = await db<{ user_id: string }>`
      select distinct user_id from push_subscriptions
    `;
    for (const u of users) {
      try {
        await sendPushToUser(db, u.user_id, {
          title: "Update bereit",
          body: data.note || "In der App auf Aktualisieren tippen.",
          url: "/app",
        });
      } catch {
        /* */
      }
    }
    return { build: next };
  });
