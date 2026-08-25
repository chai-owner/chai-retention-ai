import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CHURN_REASONS } from "@/lib/churn-store";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  /** Reason ChAi thinks is most likely, pre-selected when it matches a preset. */
  suggestedReason?: string;
  onConfirm: (reason: string, note?: string) => void;
}

export function ChurnReasonDialog({
  open,
  onOpenChange,
  customerName,
  suggestedReason,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setNote(suggestedReason ? `ChAi signal: ${suggestedReason}` : "");
  }, [open, suggestedReason]);

  const canSave = reason.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why did {customerName} churn?</DialogTitle>
          <DialogDescription>
            The reason feeds your churn patterns, win-back plays and retention insights.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {CHURN_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                reason === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add any detail (optional) — what they told you, what we could have done differently."
          rows={3}
        />

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onConfirm(reason, note);
              onOpenChange(false);
            }}
            className="inline-flex items-center justify-center rounded-lg bg-danger px-3 py-2 text-sm font-medium text-danger-foreground hover:bg-danger/90 disabled:opacity-50"
          >
            Mark as churned
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
