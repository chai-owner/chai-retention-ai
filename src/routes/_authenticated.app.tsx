import { createFileRoute, Outlet, useRouterState, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useDemoMode } from "@/lib/use-demo-mode";
import { useOrgRole } from "@/lib/use-team";
import { canManageMembers } from "@/lib/organisations";

// Pages only an owner or admin may open. Members are told why, rather than
// being bounced somewhere unexpected.
const MANAGER_ONLY = ["/app/settings", "/app/data", "/app/team"];

function GuardedOutlet() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const demo = useDemoMode();
  const role = useOrgRole(!demo);
  const restricted = MANAGER_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!demo && restricted && role && !canManageMembers(role)) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-foreground">This area is for team admins</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Business profile, integrations and team management are handled by your
            organisation's owner and admins. Ask them if you need something changed.
          </p>
          <Link
            to="/app/dashboard"
            className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated/app")({
  component: () => (
    <AppShell>
      <GuardedOutlet />
    </AppShell>
  ),
});
