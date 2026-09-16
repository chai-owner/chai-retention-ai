import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { acceptTeamInvite } from "@/lib/organisations.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept your team invitation — ChAi" },
      {
        name: "description",
        content: "Accept your invitation and join your team's retention workspace on ChAi.",
      },
      { property: "og:title", content: "Accept your team invitation — ChAi" },
      {
        property: "og:description",
        content: "Join your team's retention workspace on ChAi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptTeamInvite);
  const [status, setStatus] = useState<"checking" | "joining" | "joined" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        navigate({
          to: "/auth",
          replace: true,
          search: { demo: false, redirect: `/invite/${token}`, mode: "signup" },
        });
        return;
      }
      setStatus("joining");
      try {
        const result = await accept({ data: { token } });
        if (cancelled) return;
        setMessage(
          result?.organisationName
            ? `You've joined ${result.organisationName}.`
            : "You've joined the team.",
        );
        setStatus("joined");
      } catch (error) {
        if (cancelled) return;
        setMessage(
          error instanceof Error ? error.message : "We couldn't accept that invitation.",
        );
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accept, navigate, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">Team invitation</h1>
        {status === "checking" || status === "joining" ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Accepting your invitation…
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">{message}</p>
            <Button
              className="mt-6 w-full"
              onClick={() =>
                navigate({
                  to: status === "joined" ? "/app/dashboard" : "/",
                  search: { demo: false } as never,
                })
              }
            >
              {status === "joined" ? "Go to your workspace" : "Back to ChAi"}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
