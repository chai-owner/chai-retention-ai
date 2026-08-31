import { useEffect, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  UserMinus,
  Database,
  ClipboardList,
  Lightbulb,
  Sparkles,
  Menu,
  X,
  BadgeCheck,
  Link2,

  Settings,
  UserCog,

  LogOut,
  LogIn,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskChAi } from "@/components/ask-chai";
import { supabase } from "@/integrations/supabase/client";
import { useProfileSync } from "@/lib/use-profile-sync";
import { useProfile } from "@/lib/profile-store";
import { useDemoMode } from "@/lib/use-demo-mode";
import { impersonationStore, useImpersonation } from "@/lib/impersonation";
import { endImpersonation, getImpersonationStatus } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { clearPersistedImpersonatedAuth, millisecondsUntilExpiry } from "@/lib/impersonation";
import { hydrateIngestFromServer } from "@/lib/ingest-persistence";
import { ensureLocalCacheOwner } from "@/lib/local-user-scope";
import { hydrateCustomerAliases } from "@/lib/customer-aliases";
import { useOrgRole } from "@/lib/use-team";
import { canManageMembers } from "@/lib/organisations";


const nav = [
  { to: "/app/welcome", label: "Welcome", icon: Sparkles },
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/customers", label: "Customer Risk Center", icon: Users },
  { to: "/app/churned", label: "Churned & Win-back", icon: UserMinus },
  { to: "/app/data-quality", label: "Data Quality", icon: BadgeCheck },
  { to: "/app/identity", label: "Identity Resolution", icon: Link2 },

  { to: "/app/planner", label: "Intelligence Planner", icon: ClipboardList },
  { to: "/app/insights", label: "Insights & Benchmarks", icon: Lightbulb },
  { to: "/app/data", label: "Data Uploads & Integrations", icon: Database },
  { to: "/app/settings", label: "Business Profile", icon: Settings },
  { to: "/app/team", label: "Team & Access", icon: UserCog },
];

// Pages a locked (onboarded but not yet unlocked) customer can still access.
const LOCKED_ALLOWED = new Set(["/app/welcome", "/app/settings", "/app/data"]);

// Members (non-owner/admin) don't get settings, integrations or team management.
const MANAGER_ONLY = new Set(["/app/settings", "/app/data", "/app/team"]);


export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useProfileSync();
  const profile = useProfile();
  const demo = useDemoMode();

  // Role inside the user's organisation; members lose settings/integrations.
  const orgRole = useOrgRole(!demo && signedIn === true);

  // Locked = a signed-in customer who has onboarded but hasn't been unlocked by
  // an admin yet. Demo visitors (no session) and demo mode see the full app.
  const locked = !demo && signedIn === true && profile != null && profile.unlocked !== true;
  // In demo mode the Welcome screen (onboarding/booking) isn't part of the
  // product demo, so hide it and keep everything on sample data.
  // Once an admin unlocks the account, the Welcome/booking screen is done with.
  const hideWelcome = demo || (signedIn === true && profile?.unlocked === true);
  const baseNav = hideWelcome ? nav.filter((n) => n.to !== "/app/welcome") : nav;
  const roleNav =
    orgRole && !canManageMembers(orgRole)
      ? baseNav.filter((n) => !MANAGER_ONLY.has(n.to))
      : baseNav;
  const visibleNav = locked ? roleNav.filter((n) => LOCKED_ALLOWED.has(n.to)) : roleNav;


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const isIn = !!data.session;
      // Drop any cache left behind by a different account (sign-in as another
      // user, or admin impersonation) before rendering anything account-specific.
      ensureLocalCacheOwner(data.session?.user?.id ?? null);
      setSignedIn(isIn);
      if (isIn && !demo) {
        void hydrateIngestFromServer();
        void hydrateCustomerAliases();
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSignedIn(!!session);
      const switched = ensureLocalCacheOwner(session?.user?.id ?? null);
      if ((event === "SIGNED_IN" || switched) && !demo) {
        void hydrateIngestFromServer();
        void hydrateCustomerAliases();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [demo]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { demo: false, redirect: undefined, mode: undefined } });
  }


  return (

    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-light.png" alt="ChAi" className="h-8 w-auto" />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {visibleNav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3">
          {demo ? (
            <>
              <Link
                to="/auth"
                search={{ demo: false, redirect: undefined, mode: "signup" }}
                className="flex w-full items-center gap-3 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <LogIn className="h-[18px] w-[18px]" />
                Sign up
              </Link>
              <Link
                to="/"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <LogOut className="h-[18px] w-[18px]" />
                Exit demo
              </Link>
            </>
          ) : signedIn ? (

            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              search={{ demo: false, redirect: undefined, mode: undefined }}
              className="flex w-full items-center gap-3 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <LogIn className="h-[18px] w-[18px]" />
              Sign in to get started
            </Link>
          )}
          <div className="rounded-lg bg-sidebar-accent/60 p-3">
            <p className="text-xs font-medium text-sidebar-accent-foreground">
              {demo ? "You're exploring the demo" : signedIn ? "Your workspace" : "You're exploring the demo"}
            </p>
            <p className="mt-1 text-xs text-sidebar-foreground/70">
              {demo || !signedIn
                ? "Sample data for Northwind Labs. Nothing here is real customer data."
                : "Your live retention workspace, built from the data you've added."}
            </p>
          </div>
        </div>



      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1" />
        </header>
        <ImpersonationBanner />
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <AskChAi />
    </div>
  );
}

function ImpersonationBanner() {
  const imp = useImpersonation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const endImp = useServerFn(endImpersonation);
  const getStatus = useServerFn(getImpersonationStatus);
  const [exiting, setExiting] = useState(false);
  const [remainingMs, setRemainingMs] = useState(() =>
    imp ? millisecondsUntilExpiry(imp.expiresAt) : 0,
  );

  async function restoreAdmin(reason: "manual" | "timeout") {
    if (!imp) return;
    setExiting(true);
    try {
      await endImp({ data: { auditId: imp.auditId } }).catch(() => {});
      await supabase.auth.setSession({
        access_token: imp.adminSession.access_token,
        refresh_token: imp.adminSession.refresh_token,
      });
    } finally {
      impersonationStore.clear();
      await queryClient.cancelQueries();
      queryClient.clear();
      if (reason === "timeout") toast.info("Impersonation ended after 30 minutes");
      navigate({ to: "/admin" });
    }
  }

  useEffect(() => {
    if (!imp) return;
    let stopped = false;
    let ending = false;

    const verify = async () => {
      if (stopped || ending) return;
      const localRemaining = millisecondsUntilExpiry(imp.expiresAt);
      setRemainingMs(localRemaining);
      try {
        const status = await getStatus({ data: { auditId: imp.auditId } });
        if (stopped) return;
        setRemainingMs(millisecondsUntilExpiry(status.expiresAt));
        if (!status.active) {
          ending = true;
          await restoreAdmin(status.reason ?? "timeout");
        }
      } catch {
        // Fail closed once the known server-issued deadline is reached.
        if (localRemaining === 0) {
          ending = true;
          await restoreAdmin("timeout");
        }
      }
    };

    void verify();
    const deadlineTimer = window.setTimeout(() => void verify(), millisecondsUntilExpiry(imp.expiresAt));
    const statusTimer = window.setInterval(() => void verify(), 60_000);
    const countdownTimer = window.setInterval(
      () => setRemainingMs(millisecondsUntilExpiry(imp.expiresAt)),
      1_000,
    );
    const onFocus = () => void verify();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === imp.targetUserId) clearPersistedImpersonatedAuth();
    });
    clearPersistedImpersonatedAuth();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      window.clearTimeout(deadlineTimer);
      window.clearInterval(statusTimer);
      window.clearInterval(countdownTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      authListener.subscription.unsubscribe();
    };
    // restoreAdmin intentionally uses the current in-memory impersonation record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp?.auditId, imp?.expiresAt, getStatus]);

  if (!imp) return null;

  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));

  return (
    <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground shadow lg:px-8">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Viewing as <strong>{imp.targetName || imp.targetEmail}</strong>
        <span aria-live="polite">· {remainingMinutes} min remaining</span>
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void restoreAdmin("manual")}
        disabled={exiting}
        className="shrink-0"
      >
        <LogOut /> {exiting ? "Ending…" : "End impersonation"}
      </Button>
    </div>
  );
}
