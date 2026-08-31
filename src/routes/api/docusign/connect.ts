import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applyEnvelopeEvent } from "@/lib/server/docusign.server";

export const Route = createFileRoute("/api/docusign/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env.DOCUSIGN_CONNECT_SECRET ?? "").trim();
        const raw = await request.text();
        if (secret) {
          const given = request.headers.get("x-docusign-signature-1") || "";
          const hmac = createHmac("sha256", secret).update(raw).digest("base64");
          const a = Buffer.from(hmac);
          const b = Buffer.from(given);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("ungueltig", { status: 401 });
          }
        }
        let event = "";
        let envelopeId = "";
        try {
          const json = JSON.parse(raw) as {
            event?: string;
            data?: { envelopeId?: string; envelopeSummary?: { status?: string; envelopeId?: string } };
          };
          event = json.event || json.data?.envelopeSummary?.status || "";
          envelopeId = json.data?.envelopeId || json.data?.envelopeSummary?.envelopeId || "";
        } catch {
          return new Response("json erwartet", { status: 400 });
        }
        if (!envelopeId) return new Response("kein envelope", { status: 400 });
        await applyEnvelopeEvent(envelopeId, event);
        return new Response("ok");
      },
    },
  },
});
