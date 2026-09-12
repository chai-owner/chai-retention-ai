import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { storePendingPlan } from "@/lib/pending-plan";
import type { OrgPlan } from "@/lib/organisations";


import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Removes the `demo` flag from a URL/path so a real login never lands on the
// sample-data demo (the flag is otherwise retained across navigation).
function stripDemo(href: string): string {
  try {
    const url = new URL(href, "http://x");
    url.searchParams.delete("demo");
    return url.pathname + (url.search ? url.search : "");
  } catch {
    return href;
  }
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    mode: search.mode === "signup" ? ("signup" as const) : undefined,
    plan: typeof search.plan === "string" ? search.plan : undefined,
    period:
      search.period === "annual"
        ? ("annual" as const)
        : search.period === "monthly"
          ? ("monthly" as const)
          : undefined,
  }),

  head: () => ({ meta: [{ title: "Sign in — ChAi" }] }),
  beforeLoad: async () => {
    // Intentionally do NOT auto-redirect signed-in users away from /auth.
    // A visitor who clicks "Log in" or "Sign up" expects to see the form
    // (e.g. to sign in as a different account), not to be bounced into the
    // app or an incomplete onboarding flow from a stale session.
  },
  component: AuthPage,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function AuthPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo, mode: initialMode, plan, period } = Route.useSearch();
  const dest = stripDemo(redirectTo ?? "/app");

  // Arriving from a pricing "Get started" link: remember the chosen plan so the
  // paywall at the end of the trial can pre-select it.
  useEffect(() => {
    if (plan) storePendingPlan({ plan: plan as OrgPlan, period: period ?? "monthly" });
  }, [plan, period]);

  // A brand-new account must always land in onboarding first; the app pages
  // are only meaningful once the business profile exists.
  const signupDest = "/onboarding";
  const [mode, setMode] = useState<"login" | "register" | "forgot">(
    initialMode === "signup" ? "register" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState<false | "register" | "forgot">(
    false,
  );
  const [acceptedTerms, setAcceptedTerms] = useState(false);


  function goToDest() {
    if (redirectTo) navigate({ href: stripDemo(redirectTo) });
    else navigate({ to: "/app", search: { demo: false } });
  }



  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "register" && !acceptedTerms) {
      toast.error("Please accept the Terms of Service to continue.");
      return;
    }
    setLoading(true);
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setEmailSent("forgot");
      setLoading(false);
      return;
    }
    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${signupDest}`,
          data: {
            full_name: name.trim(),
            terms_accepted_at: new Date().toISOString(),
          },
        },
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setEmailSent("register");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes("Email not confirmed")) {
        toast.error("Please confirm your email first — check your inbox.");
      } else {
        // Supabase returns a generic "Invalid login credentials" for both a
        // wrong password and an unknown email — don't claim the account is
        // missing, just say the details didn't match.
        toast.error(
          "Incorrect email or password. Try again, or use 'Forgot password?' to reset it.",
        );
      }

      setLoading(false);
      return;
    }
    goToDest();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center">
          <img src="/logo-light.png" alt="ChAi" className="h-11 w-auto" />
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          {emailSent ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <Mail className="h-6 w-6 text-primary" />
              </span>
              <h1 className="mt-4 text-xl font-semibold">
                {emailSent === "register"
                  ? "Confirm your email"
                  : "Check your inbox"}
              </h1>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                {emailSent === "register" ? (
                  <>
                    We sent a confirmation link to <strong>{email}</strong>. Click
                    it to activate your account, then come back to sign in.
                  </>
                ) : (
                  <>
                    We sent a password reset link to <strong>{email}</strong>.
                    Click it to choose a new password.
                  </>
                )}
              </p>
              <button
                onClick={() => {
                  setEmailSent(false);
                  setMode("login");
                }}
                className="mt-6 text-sm font-medium text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-xl font-semibold">
                  {mode === "login"
                    ? "Welcome back"
                    : mode === "register"
                      ? "Create your account"
                      : "Reset your password"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode === "login"
                    ? "Sign in to your retention workspace."
                    : mode === "register"
                      ? "Start understanding your customer retention."
                      : "Enter your email and we'll send you a reset link."}
                </p>
              </div>





              <form onSubmit={handleEmail} className="space-y-3">
                {mode === "register" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Full name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                      placeholder="Jane Doe"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    placeholder="you@company.com"
                  />
                </div>
                {mode !== "forgot" && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Password
                      </label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputCls}
                      placeholder="••••••••"
                    />
                  </div>
                )}
                {mode === "register" && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/60 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <span className="text-muted-foreground">
                      I have read and agree to the{" "}
                      <Link
                        to="/terms"
                        target="_blank"
                        className="font-medium text-primary hover:underline"
                      >
                        Terms of Service
                      </Link>
                      .
                    </span>
                  </label>
                )}
                <button
                  type="submit"
                  disabled={loading || (mode === "register" && !acceptedTerms)}

                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60",
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login"
                        ? "Sign in"
                        : mode === "register"
                          ? "Create account"
                          : "Send reset link"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                {mode === "login"
                  ? "Don't have an account?"
                  : mode === "register"
                    ? "Already have an account?"
                    : "Remember your password?"}{" "}
                <button
                  onClick={() =>
                    setMode(mode === "register" ? "login" : "login")
                  }
                  className="font-medium text-primary hover:underline"
                >
                  {mode === "register" ? "Sign in" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

