import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// The same deployment serves both the marketing site (www.askchai.tech)
// and the authenticated app (app.askchai.tech). Search engines fetch
// robots.txt per-host, so we choose the body from the Host header.
const MARKETING_ROBOTS = `User-agent: *
Allow: /

Sitemap: https://www.askchai.tech/sitemap.xml`;

const APP_ROBOTS = `User-agent: *
Disallow: /`;

export function isAppHost(hostname: string): boolean {
  if (hostname === "app.askchai.tech") return true;
  // Lovable preview / id-preview hosts should never be indexed either.
  if (hostname.endsWith(".lovable.app")) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return false;
}

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Behind a proxy the original host arrives in x-forwarded-host.
        const hostHeader =
          request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
        const hostname = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();

        const body = isAppHost(hostname) ? APP_ROBOTS : MARKETING_ROBOTS;

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
