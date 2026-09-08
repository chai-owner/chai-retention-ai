import { useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { askChai } from "@/lib/ai.functions";
import { useScoredData, useDataCoverage } from "@/lib/use-scored-data";
import { coverageBasis } from "@/lib/data-coverage";
import { useProfile } from "@/lib/profile-store";
import { formatCurrency } from "@/lib/mock-data";


interface Msg {
  role: "user" | "assistant";
  text: string;
}

const suggestions = [
  "What data should I be tracking?",
  "Why are my customers at risk?",
  "How can I reduce churn?",
  "What is customer health?",
];

const GREETING =
  "Hi, I'm ChAi — your AI retention analyst. Ask me anything about your customers, churn risk, or what to do next.";

export function AskChAi() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: GREETING }]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { executive, sortedByRisk } = useScoredData();
  const coverage = useDataCoverage();
  const profile = useProfile();
  const ask = useServerFn(askChai);

  function buildContext() {
    const e = executive;
    const top = sortedByRisk.slice(0, 5);
    const topLines = top
      .map(
        (c) =>
          `${c.name}: ${c.churnProbability}% churn risk, ${formatCurrency(c.revenue)} revenue, health ${c.health}/100`,
      )
      .join("; ");
    return [
      `Total customers: ${e.totalCustomers ?? "n/a"}`,
      `At-risk accounts: ${e.atRisk}, critical: ${e.critical}`,
      `Predicted monthly churn: ${e.predictedMonthlyChurn}`,
      `Revenue at risk: ${formatCurrency(e.revenueAtRisk)}`,
      `Top at-risk accounts: ${topLines || "none"}`,
    ].join("\n");
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const history: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(history);
    setInput("");
    setLoading(true);
    scrollToBottom();
    try {
      const { reply } = await ask({
        data: {
          messages: history.filter((m) => m.text !== GREETING).map((m) => ({ role: m.role, text: m.text })),
          context: buildContext(),
          coverage: {
            confidence: coverage.confidence,
            headline: coverage.headline,
            notes: coverage.notes,
            basis: coverageBasis(coverage),
          },
          profile: {
            industry: profile?.industry,
            model: profile?.model,
            whatBuy: profile?.whatBuy,
            cadence: profile?.cadence,
          },
        },
      });

      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Sorry — I couldn't reach the analysis service just now. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-warm px-4 py-3 text-sm font-medium text-primary-foreground shadow-card transition-transform hover:scale-105"
        >
          <Sparkles className="h-4 w-4" />
          Ask ChAi
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[32rem] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border bg-gradient-warm px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-semibold">Ask ChAi</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Persistent data-confidence strip — mirrors what ChAi says in its
              caveats by using the same useDataCoverage() assessment. */}
          {coverage.confidence !== "good" && (
            <Link
              to="/app/data-quality"
              title="View data coverage details"
              className={cn(
                "flex items-center gap-1.5 border-b border-border px-4 py-1.5 text-[11px] font-medium transition-colors",
                coverage.confidence === "low"
                  ? "bg-danger/10 text-danger hover:bg-danger/15"
                  : "bg-warning/10 text-warning-foreground hover:bg-warning/15",
              )}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {coverage.confidence === "low"
                ? "Limited data available — answers may be incomplete"
                : "Some data may be outdated"}
            </Link>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="flex max-w-[85%] items-center gap-2 rounded-2xl bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                ChAi is thinking…
              </div>
            )}
            {messages.length <= 1 && !loading && (
              <div className="space-y-2 pt-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about churn, health, or next steps…"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Send"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
