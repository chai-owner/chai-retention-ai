// Demo mode is driven by a `?demo=1` search param that is retained across
// navigation (see the root route's retainSearchParams middleware). When on,
// every /app page shows the illustrative sample dataset and skips the
// signed-in onboarding/welcome redirects — so a logged-in user can view the
// public product demo without seeing any of their own real data.
import { useSearch } from "@tanstack/react-router";

export function isDemoValue(raw: unknown): boolean {
  return raw === true || raw === "1" || raw === "true";
}

export function useDemoMode(): boolean {
  const search = useSearch({ strict: false }) as { demo?: unknown };
  return isDemoValue(search?.demo);
}

