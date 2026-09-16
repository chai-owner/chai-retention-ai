// "Have a promo code?" disclosure used on the pricing page and the
// expired-trial paywall. Validation lives in @/lib/promo-codes.
import { useEffect, useState } from "react";

import {
  FOUNDER_SUCCESS_MESSAGE,
  PROMO_INVALID_MESSAGE,
  validatePromoCode,
} from "@/lib/promo-codes";
import { cn } from "@/lib/utils";

export function PromoCodeField({
  appliedCode,
  onApply,
  initialCode,
  tone = "light",
  className,
}: {
  /** The code currently applied, if any. */
  appliedCode: string | null;
  onApply: (code: string | null) => void;
  /** Pre-filled + auto-applied code (e.g. from a Founder invite link). */
  initialCode?: string | null;
  tone?: "light" | "dark";
  className?: string;
}) {
  const [open, setOpen] = useState(Boolean(initialCode));
  const [value, setValue] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialCode) return;
    setOpen(true);
    setValue(initialCode);
    const valid = validatePromoCode(initialCode);
    if (valid) onApply(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const submit = () => {
    const valid = validatePromoCode(value);
    if (!valid) {
      setError(PROMO_INVALID_MESSAGE);
      onApply(null);
      return;
    }
    setError(null);
    setValue(valid);
    onApply(valid);
  };

  const muted = tone === "dark" ? "text-white/70" : "text-muted-foreground";

  return (
    <div className={cn("text-center text-sm", className)}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("underline underline-offset-4 transition-colors hover:text-primary", muted)}
        >
          Have a promo code?
        </button>
      ) : (
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-center gap-2">
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="Enter promo code"
              aria-label="Promo code"
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={submit}
              className="shrink-0 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Apply
            </button>
          </div>
          {appliedCode ? (
            <p className="mt-2 font-medium text-success">{FOUNDER_SUCCESS_MESSAGE}</p>
          ) : error ? (
            <p className="mt-2 text-destructive">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
