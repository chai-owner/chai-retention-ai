import { createFileRoute } from "@tanstack/react-router";

/**
 * Build stamp so we can tell exactly which code the live worker is serving.
 * Bump BUILD_STAMP whenever a deployment needs to be verifiably fresh.
 */
const BUILD_STAMP = "43a801c-sync-diagnostics-1";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ build: BUILD_STAMP }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
