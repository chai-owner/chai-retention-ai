import { createServerFn } from "@tanstack/react-start";
import { requireConnectedAuth } from "@/lib/connected-auth-middleware";
import type { DailyBrief } from "@/lib/daily-brief";

type Ctx = { supabase: any; userId: string };

export type TodayBrief = DailyBrief & { scoredAt: string | null };

export const getTodayBrief = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .handler(async ({ context }): Promise<TodayBrief> => {
    const { supabase, userId } = context as Ctx;
    const { loadDailyBrief } = await import("@/lib/daily-brief.server");
    return loadDailyBrief(supabase, userId, { useAi: true });
  });
