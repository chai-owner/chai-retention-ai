// Owner/admin action: set (or clear) a metric's explicit "good" direction and
// save it to the account, so both scoring paths pick it up.
import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { profileStore } from "@/lib/profile-store";
import { saveProfile } from "@/lib/profile.functions";
import type { MetricDirection, PlannerMetric } from "@/lib/mock-data";

export function withMetricDirection(
  metrics: PlannerMetric[],
  name: string,
  direction: MetricDirection | null,
): PlannerMetric[] {
  return metrics.map((m) => {
    if (m.name !== name) return m;
    const { direction: _old, ...rest } = m;
    return direction ? { ...rest, direction } : rest;
  });
}

export function useSetMetricDirection() {
  const persist = useServerFn(saveProfile);
  return useCallback(
    async (name: string, direction: MetricDirection | null) => {
      const current = profileStore.getSnapshot();
      if (!current?.metrics) return;
      const metrics = withMetricDirection(current.metrics, name, direction);
      profileStore.save({ ...current, metrics });
      try {
        await persist({
          data: {
            company: current.company ?? "",
            industry: current.industry ?? "",
            model: current.model ?? "",
            size: current.size,
            customers: current.customers,
            avgValue: current.avgValue,
            whatBuy: current.whatBuy,
            cadence: current.cadence,
            lifespan: current.lifespan,
            concerns: current.concerns,
            mustTrack: current.mustTrack ?? "",
            segments: current.segments ?? [],
            successActions: current.successActions ?? "",
            disengagement: current.disengagement ?? "",
            churnDefinition: current.churnDefinition,
            tracked: current.tracked ?? {},
            channels: current.channels ?? [],
            metricWeights: current.metricWeights,
            metrics,
          },
        });
      } catch (err) {
        toast.error("Couldn't save the direction", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    },
    [persist],
  );
}
