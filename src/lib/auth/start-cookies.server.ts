import { setCookie } from "@tanstack/react-start/server";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { createAuthMiddleware } from "better-auth/api";

/** Like better-auth tanstackStartCookies, but no dynamic import (Nitro crash). */
export function e1StartCookies() {
  return {
    id: "e1-start-cookies",
    hooks: {
      after: [
        {
          matcher() {
            return true;
          },
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.responseHeaders;
            if (!returned || typeof returned.get !== "function") return;
            const setCookies = returned.get("set-cookie");
            if (!setCookies) return;
            const parsed = parseSetCookieHeader(setCookies);
            parsed.forEach((value, key) => {
              if (!key) return;
              try {
                setCookie(key, value.value, toCookieOptions(value));
              } catch {
                /* ignore malformed cookie */
              }
            });
          }),
        },
      ],
    },
  };
}
