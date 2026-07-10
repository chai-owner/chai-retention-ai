import { useState } from "react";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Sparkles, Loader2, Mail, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
  }),
  head: () => ({ meta: [{ title: "Sign in — ChAi" }] }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw search.redirect
        ? redirect({ href: stripDemo(search.redirect) })
        : redirect({ to: "/app/dashboard", search: { demo: undefined } });
    }
  },
  component: AuthPage,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function AuthPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo, mode: initialMode } = Route.useSearch();
  const dest = redirectTo ?? "/app/dashboard";
  const [mode, setMode] = useState<"login" | "register">(
    initialMode === "signup" ? "register" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  function goToDest() {
    if (redirectTo) navigate({ href: redirectTo });
    else navigate({ to: "/app/dashboard" });
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + dest,
    });
    if (result.error) {
      toast.error("Couldn't sign in with Google. Please try again.");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    goToDest();
  }


  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${dest}`,
          data: { full_name: name.trim() },
        },
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setEmailSent(true);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(
        error.message.includes("Email not confirmed")
          ? "Please confirm your email first — check your inbox."
          : "Incorrect email or password.",
      );
      setLoading(false);
      return;
    }
    goToDest();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-warm text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">ChAi</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          {emailSent ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <Mail className="h-6 w-6 text-primary" />
              </span>
              <h1 className="mt-4 text-xl font-semibold">Confirm your email</h1>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                We sent a confirmation link to <strong>{email}</strong>. Click it to
                activate your account, then come back to sign in.
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
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode === "login"
                    ? "Sign in to your retention workspace."
                    : "Start understanding your customer retention."}
                </p>
              </div>

              <button
                onClick={handleGoogle}
                disabled={loading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
              >
                <GoogleIcon /> Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
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
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Password
                  </label>
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
                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60",
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Sign in" : "Create account"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => setMode(mode === "login" ? "register" : "login")}
                  className="font-medium text-primary hover:underline"
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
