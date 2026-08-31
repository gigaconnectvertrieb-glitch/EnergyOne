/**
 * Security headers for the deployed portal. Preview iframe stays allowed
 * on grok-sandbox; Render/production is locked down.
 */
interface Ev {
  url: URL;
  req: { method: string; headers: Headers };
}

function isPreview(host: string) {
  return host.endsWith(".grok-sandbox.com") || host.includes("localhost");
}

export default async function securityHeaders(event: Ev, next: () => unknown | Promise<unknown>) {
  const result = await next();
  if (!(result instanceof Response)) return result;
  const host =
    event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host;
  const headers = new Headers(result.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  headers.set("X-DNS-Prefetch-Control", "off");
  if (!isPreview(host)) {
    headers.set("X-Frame-Options", "DENY");
    headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
