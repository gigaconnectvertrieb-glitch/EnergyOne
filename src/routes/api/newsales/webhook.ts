import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { applyNewsalesWebhook } from "@/lib/server/newsales.server";

export const Route = createFileRoute("/api/newsales/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env.NEWSALES_WEBHOOK_SECRET ?? "").trim();
        if (secret) {
          const given = request.headers.get("x-newsales-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
          const a = Buffer.from(secret);
          const b = Buffer.from(given);
          if (!given || a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("ungueltig", { status: 401 });
          }
        }
        let json: { portalId?: string; id?: string; reference?: string; status?: string } = {};
        try {
          json = (await request.json()) as typeof json;
        } catch {
          return new Response("json erwartet", { status: 400 });
        }
        const res = await applyNewsalesWebhook({
          portalId: json.portalId || json.id,
          reference: json.reference,
          status: json.status,
        });
        if (!res.ok) return Response.json(res, { status: 404 });
        return Response.json(res);
      },
    },
  },
});
