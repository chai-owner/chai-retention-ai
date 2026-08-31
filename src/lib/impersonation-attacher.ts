import { createMiddleware } from "@tanstack/react-start";
import { impersonationStore } from "@/lib/impersonation";

// Identifies the volatile impersonation session to authenticated server
// functions so the server can enforce its own authoritative deadline.
export const attachImpersonation = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const auditId = impersonationStore.getSnapshot()?.auditId;
    return next({
      headers: auditId ? { "X-Chai-Impersonation-Id": auditId } : {},
    });
  },
);