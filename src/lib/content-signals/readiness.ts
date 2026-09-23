// Trigger for the REAL-DATA validation that still has to happen.
//
// The Phase 0 accuracy figures were produced against constructed test
// examples (src/lib/content-signals/test-set.ts), not real customer language.
// They are provisional. Once any account — internal or a real customer —
// accumulates enough genuine support conversations from a connected
// integration, Phase 0 must be re-run against that real data before the
// constructed-set result is treated as the answer.
export const REAL_DATA_READY_THRESHOLD = 20;

export interface AccountSupportVolume {
  userId: string;
  label: string;
  /** Conversations that arrived from a connected support integration. */
  connectedConversations: number;
}

export interface ReadinessSummary {
  threshold: number;
  ready: boolean;
  /** Accounts at or above the threshold. */
  readyAccounts: AccountSupportVolume[];
  /** Largest connected-conversation count seen on any account. */
  largestAccount: AccountSupportVolume | null;
  totalConnectedConversations: number;
  message: string;
}

export function summariseReadiness(accounts: AccountSupportVolume[]): ReadinessSummary {
  const sorted = [...accounts].sort((a, b) => b.connectedConversations - a.connectedConversations);
  const readyAccounts = sorted.filter((a) => a.connectedConversations >= REAL_DATA_READY_THRESHOLD);
  const largestAccount = sorted[0] ?? null;
  const total = sorted.reduce((sum, a) => sum + a.connectedConversations, 0);
  const ready = readyAccounts.length > 0;
  const message = ready
    ? `Ready to re-run Phase 0 against real data — ${readyAccounts.length} account${
        readyAccounts.length === 1 ? "" : "s"
      } now ${readyAccounts.length === 1 ? "has" : "have"} ${REAL_DATA_READY_THRESHOLD}+ real support conversations. The current accuracy figures come from constructed test examples only.`
    : `Not ready. The current accuracy figures come from constructed test examples only. The largest account has ${
        largestAccount?.connectedConversations ?? 0
      } real support conversations; ${REAL_DATA_READY_THRESHOLD} are needed before Phase 0 can be re-run against real data.`;
  return { threshold: REAL_DATA_READY_THRESHOLD, ready, readyAccounts, largestAccount, totalConnectedConversations: total, message };
}
