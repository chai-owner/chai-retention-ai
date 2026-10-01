// Business profile: the account's data currency (USD or ZAR). Labels and
// formatting only — amounts are never converted. Owners/admins can change it,
// after a confirmation that says how many rows will be left out of totals.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Info, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/chai";
import { cn } from "@/lib/utils";
import { profileStore } from "@/lib/profile-store";
import { useAccountCurrency } from "@/lib/account-currency";
import { useIngested } from "@/lib/ingested-data-store";
import { applyAccountCurrency } from "@/lib/currency-rules";
import { DATA_CURRENCIES, DATA_CURRENCY_LABELS, type DataCurrency } from "@/lib/money";
import {
  dismissCurrencySuggestion,
  getDataCurrencyStatus,
  setDataCurrency,
} from "@/lib/data-currency.functions";

const STATUS_KEY = ["data-currency-status"];

function useCurrencyStatus() {
  const fetchStatus = useServerFn(getDataCurrencyStatus);
  return useQuery({ queryKey: STATUS_KEY, queryFn: () => fetchStatus(), staleTime: 60_000 });
}

/** Rows whose amounts would be left out under `currency`. */
function useExcludedCount(currency: DataCurrency): number {
  const raw = useIngested();
  return useMemo(() => applyAccountCurrency(raw, currency).exclusion.excludedRows, [raw, currency]);
}

function useSwitch() {
  const save = useServerFn(setDataCurrency);
  const qc = useQueryClient();
  return async (currency: DataCurrency, excludedRows: number) => {
    await save({ data: { currency, excludedRows } });
    const current = profileStore.getSnapshot();
    if (current) profileStore.save({ ...current, dataCurrency: currency });
    await qc.invalidateQueries({ queryKey: STATUS_KEY });
  };
}

export function ConfirmCurrencyDialog({
  target,
  onClose,
}: {
  target: DataCurrency | null;
  onClose: () => void;
}) {
  const current = useAccountCurrency();
  const excluded = useExcludedCount(target ?? current);
  const doSwitch = useSwitch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AlertDialog open={target != null} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch data currency to {target}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Amounts are relabelled, not converted. A figure that shows as {current === "USD" ? "$12,500" : "R 12,500"} today will
                show as {target === "USD" ? "$12,500" : "R 12,500"}.
              </p>
              <p>
                {excluded === 0
                  ? `No records are in another currency, so nothing is left out of your totals.`
                  : `${excluded} ${excluded === 1 ? "record is" : "records are"} in another currency and will be left out of revenue totals and amount-based measures. Their dates still count.`}
              </p>
              <p>Scores update on screen straight away and in tonight's scoring run.</p>
              {error && <p className="text-danger">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              if (!target) return;
              setBusy(true);
              setError(null);
              doSwitch(target, excluded)
                .then(onClose)
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false));
            }}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Switch to {target}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Suggestion / plain note from connected Xero or QuickBooks organisations. */
export function CurrencySuggestionBanner({ className }: { className?: string }) {
  const { data } = useCurrencyStatus();
  const dismiss = useServerFn(dismissCurrencySuggestion);
  const qc = useQueryClient();
  const [target, setTarget] = useState<DataCurrency | null>(null);
  const s = data?.suggestion;
  if (!s) return null;
  if (s.kind === "note") {
    return (
      <div className={cn("flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground", className)}>
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>{s.message}</p>
      </div>
    );
  }
  const names = s.orgs.map((o) => o.name).join(", ");
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm", className)}>
      <Coins className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">
        {s.orgs.length === 1 ? `Your organisation ${names} uses` : `Your organisations (${names}) all use`} {s.currency}.
        Switch data currency to {s.currency}?
      </p>
      {data?.canChange ? (
        <button
          type="button"
          onClick={() => setTarget(s.currency)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Switch to {s.currency}
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">Ask an account owner or admin to switch.</span>
      )}
      <button
        type="button"
        onClick={() => {
          dismiss({ data: { currency: s.currency } })
            .then(() => qc.invalidateQueries({ queryKey: STATUS_KEY }))
            .catch(() => undefined);
        }}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Dismiss
      </button>
      <ConfirmCurrencyDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

export function DataCurrencyCard() {
  const current = useAccountCurrency();
  const { data } = useCurrencyStatus();
  const canChange = data?.canChange ?? false;
  const [target, setTarget] = useState<DataCurrency | null>(null);
  return (
    <Card
      title="Data currency"
      subtitle="The currency your customer data is in. Changing it relabels amounts — nothing is converted."
      className="space-y-3 sm:p-6"
    >
      <div className="flex flex-wrap gap-2">
        {DATA_CURRENCIES.map((c) => (
          <button
            key={c}
            type="button"
            disabled={!canChange || c === current}
            onClick={() => setTarget(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default",
              c === current ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent",
            )}
          >
            {DATA_CURRENCY_LABELS[c]}
          </button>
        ))}
      </div>
      {!canChange && data && (
        <p className="text-xs text-muted-foreground">Only an account owner or admin can change this.</p>
      )}
      <CurrencySuggestionBanner />
      <ConfirmCurrencyDialog target={target} onClose={() => setTarget(null)} />
    </Card>
  );
}
