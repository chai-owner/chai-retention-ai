import { useEffect, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  Settings,
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
import { endImpersonation } from "@/lib/admin.functions";
import { hydrateIngestFromServer } from "@/lib/ingest-persistence";

const nav = [
  { to: "/app/welcome", label: "Welcome", icon: Sparkles },
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/customers", label: "Customer Risk Center", icon: Users },
  { to: "/app/churned", label: "Churned & Win-back", icon: UserMinus },
  { to: "/app/data-quality", label: "Data Quality", icon: BadgeCheck },
  { to: "/app/planner", label: "Intelligence Planner", icon: ClipboardList },
  { to: "/app/insights", label: "Insights & Benchmarks", icon: Lightbulb },
  { to: "/app/data", label: "Data Uploads & Integrations", icon: Database },
  { to: "/app/settings", label: "Business Profile", icon: Settings },
];

// Pages a locked (onboarded but not yet unlocked) customer can still access.
const LOCKED_ALLOWED = new Set(["/app/welcome", "/app/settings", "/app/data"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useProfileSync();
  const profile = useProfile();
  const demo = useDemoMode();

  // Locked = a signed-in customer who has onboarded but hasn't been unlocked by
  // an admin yet. Demo visitors (no session) and demo mode see the full app.
  const locked = !demo && signedIn === true && profile != null && profile.unlocked !== true;
  // In demo mode the Welcome screen (onboarding/booking) isn't part of the
  // product demo, so hide it and keep everything on sample data.
  const baseNav = demo ? nav.filter((n) => n.to !== "/app/welcome") : nav;
  const visibleNav = locked ? baseNav.filter((n) => LOCKED_ALLOWED.has(n.to)) : baseNav;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const isIn = !!data.session;
      setSignedIn(isIn);
      if (isIn && !demo) void hydrateIngestFromServer();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSignedIn(!!session);
      if (event === "SIGNED_IN" && !demo) void hydrateIngestFromServer();
    });
    return () => sub.subscription.unsubscribe();
  }, [demo]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">ChAi</span>
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
            <Link
              to="/"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Exit demo
            </Link>
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
              search={{ demo: false }}
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
  const [exiting, setExiting] = useState(false);

  if (!imp) return null;

  async function exit() {
    if (!imp) return;
    setExiting(true);
    try {
      if (imp.auditId) await endImp({ data: { auditId: imp.auditId } }).catch(() => {});
      await supabase.auth.setSession({
        access_token: imp.adminSession.access_token,
        refresh_token: imp.adminSession.refresh_token,
      });
    } finally {
      impersonationStore.clear();
      await queryClient.cancelQueries();
      queryClient.clear();
      navigate({ to: "/admin" });
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground lg:px-8">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Viewing as <strong>{imp.targetName || imp.targetEmail}</strong> (admin impersonation)
      </span>
      <button
        onClick={exit}
        disabled={exiting}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground/15 px-3 py-1 font-medium transition-colors hover:bg-primary-foreground/25 disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" /> Exit impersonation
      </button>
    </div>
  );
}
