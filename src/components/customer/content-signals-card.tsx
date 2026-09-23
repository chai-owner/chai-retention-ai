// Content risk signals for one customer: what was said, in their words.
//
// These are flags only — they do not move the health score (that's Phase 3),
// and the extraction behind them has so far been validated against constructed
// test examples rather than real customer language.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareWarning, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/chai";
import { cn } from "@/lib/utils";
import { signalLabel, sourceLabelFor, SIGNAL_TONE } from "@/lib/content-signals/labels";
import {
  dismissContentSignal,
  getCustomerContentSignals,
} from "@/lib/content-signals/content-signals.functions";

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export function ContentSignalsCard({ customerRefs }: { customerRefs: string[] }) {
  const fetchSignals = useServerFn(getCustomerContentSignals);
  const dismiss = useServerFn(dismissContentSignal);
  const queryClient = useQueryClient();
  const refs = customerRefs.filter(Boolean).slice(0, 50);

  const { data } = useQuery({
    queryKey: ["content-signals", refs],
    queryFn: () => fetchSignals({ data: { customerRefs: refs } }),
    enabled: refs.length > 0,
    staleTime: 60_000,
  });

  const signals = data ?? [];
  if (signals.length === 0) return null;

  return (
    <Card className="mt-6">
      <div className="flex items-start gap-2.5">
        <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <h3 className="font-semibold">What this customer has said</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Picked up from conversations in your connected tools. Shown as flags for you to
            judge — they don't change the health score.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {signals.map((s) => (
          <li
            key={s.id}
            className={cn(
              "rounded-xl border p-3",
              SIGNAL_TONE[s.signal] === "danger"
                ? "border-danger/25 bg-danger/5"
                : "border-warning/25 bg-warning/5",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{signalLabel(s.signal)}</span>
              <span className="text-xs text-muted-foreground">
                {sourceLabelFor(s.source)}
                {formatDate(s.occurredAt) ? ` · ${formatDate(s.occurredAt)}` : ""}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await dismiss({ data: { id: s.id } });
                  toast.success("Flag dismissed", { description: "Marked as not a real signal." });
                  queryClient.invalidateQueries({ queryKey: ["content-signals"] });
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
              >
                <X className="h-3 w-3" /> Not right
              </button>
            </div>
            <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic text-foreground">
              “{s.quote}”
            </blockquote>
          </li>
        ))}
      </ul>
    </Card>
  );
}
