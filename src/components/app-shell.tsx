import { useEffect, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  UserMinus,
  Database,
  ClipboardList,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Menu,
  X,
  BadgeCheck,
  Settings,
  LogOut,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskChAi } from "@/components/ask-chai";
import { supabase } from "@/integrations/supabase/client";
import { useProfileSync } from "@/lib/use-profile-sync";

const nav = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/customers", label: "Customer Risk Center", icon: Users },
  { to: "/app/churned", label: "Churned & Win-back", icon: UserMinus },
  { to: "/app/data", label: "Data Uploads & Integrations", icon: Database },
  { to: "/app/data-quality", label: "Data Quality", icon: BadgeCheck },
  { to: "/app/planner", label: "Intelligence Planner", icon: ClipboardList },
  { to: "/app/insights", label: "Insights & Benchmarks", icon: Lightbulb },
  { to: "/app/trust", label: "Trust & Compliance", icon: ShieldCheck },
  { to: "/app/settings", label: "Business Profile", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useProfileSync();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(!!session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-warm text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">ChAi</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => {
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
          {signedIn ? (
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
              className="flex w-full items-center gap-3 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <LogIn className="h-[18px] w-[18px]" />
              Sign in to get started
            </Link>
          )}
          <div className="rounded-lg bg-accent/60 p-3">
            <p className="text-xs font-medium text-accent-foreground">
              {signedIn ? "Demo workspace" : "You're exploring the demo"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sample data for Northwind Labs. Nothing here is real customer data.
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
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span className="h-2 w-2 rounded-full bg-success" />
            Retention engine synced 4 min ago
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
            N
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <AskChAi />
    </div>
  );
}
