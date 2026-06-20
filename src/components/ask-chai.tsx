import { useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const suggestions = [
  "What data should I be tracking?",
  "Why is a customer at risk?",
  "How can I reduce churn?",
  "What is customer health?",
];

const answers: { match: string[]; reply: string }[] = [
  {
    match: ["track", "data", "missing", "collect"],
    reply:
      "Start with four things: how often customers log in or buy, how much they spend, how many support issues they raise, and how satisfied they are. Right now your engagement and support data are thin — connecting a support tool and tracking product usage would give the biggest jump in prediction accuracy.",
  },
  {
    match: ["risk", "churn", "leave", "why"],
    reply:
      "A customer is flagged at risk when several warning signs stack up — for example, usage dropping, support tickets going unresolved, negative messages, or a competitor being mentioned. Open any customer in the Risk Center to see the exact contributing factors explained in plain English.",
  },
  {
    match: ["reduce", "improve", "retention", "first", "recommend"],
    reply:
      "The fastest wins are usually: close out unresolved support tickets, run a personal check-in with your top at-risk accounts, and re-engage customers whose usage has stalled. The Insights page ranks recommendations by expected revenue saved so you know what to do first.",
  },
  {
    match: ["health", "score", "what is"],
    reply:
      "Customer health is a simple 0–100 score that blends how much a customer uses you, how much they spend, how their support experience is going, and how they feel. High health means a happy, sticky customer; low health means they may be slipping away. Think of it like a credit score, but for the strength of the relationship.",
  },
  {
    match: ["benchmark", "industry", "compare"],
    reply:
      "Benchmarks show how you compare to similar businesses. Your churn rate is currently above the industry average, while your support response time is better than most peers. See the Insights & Benchmarks page for the full breakdown.",
  },
];

function answerFor(q: string) {
  const lower = q.toLowerCase();
  const hit = answers.find((a) => a.match.some((m) => lower.includes(m)));
  return (
    hit?.reply ??
    "Great question. Based on your workspace, I'd focus on understanding which customers are slipping and why — the Risk Center and Insights pages break that down in plain language. Ask me about customer health, churn risk, what to track, or how to improve retention."
  );
}

export function AskChai() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi, I'm Chai — your AI retention analyst. Ask me anything about your customers, churn risk, or what to do next.",
    },
  ]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: answerFor(q) }]);
    setInput("");
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-warm px-4 py-3 text-sm font-medium text-primary-foreground shadow-card transition-transform hover:scale-105"
        >
          <Sparkles className="h-4 w-4" />
          Ask Chai
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[32rem] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border bg-gradient-warm px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-semibold">Ask Chai</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {m.text}
              </div>
            ))}
            {messages.length <= 1 && (
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
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
