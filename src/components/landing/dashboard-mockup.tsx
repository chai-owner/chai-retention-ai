import { ArrowUpRight, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

const health = [
  { name: "Northwind Trading", score: 92, tone: "bg-[#2C7A6B]" },
  { name: "Halcyon Labs", score: 74, tone: "bg-[#C7962E]" },
  { name: "Bright Fern Co.", score: 41, tone: "bg-[#B6423F]" },
];

const bars = [38, 52, 44, 61, 55, 72, 66, 84];

/** Static, realistic product mockup used on the marketing hero. */
export function DashboardMockup() {
  return (
    <div className="w-full overflow-hidden rounded-[22px] bg-white text-[#152238] shadow-[0_40px_90px_-30px_rgba(2,8,23,0.65)] ring-1 ring-black/5">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-[#E4E9DE] px-5 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#DDE6D9]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#DDE6D9]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#DDE6D9]" />
        <span className="ml-3 text-[11px] font-medium text-[#8A9AA6]">ChAi · Retention overview</span>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-3">
        {/* KPI row */}
        <div className="rounded-2xl bg-[#F7F9E1] p-4">
          <p className="text-[11px] font-medium text-[#4A5A6B]">Revenue at risk</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">$184,200</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#B6423F]">
            <TrendingUp className="h-3 w-3" /> +6.4% vs last month
          </p>
        </div>
        <div className="rounded-2xl bg-[#F7F9E1] p-4">
          <p className="text-[11px] font-medium text-[#4A5A6B]">Avg. health score</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">78</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#2C7A6B]">
            <TrendingUp className="h-3 w-3" /> +3 pts
          </p>
        </div>
        <div className="rounded-2xl bg-[#F7F9E1] p-4">
          <p className="text-[11px] font-medium text-[#4A5A6B]">Churn risk accounts</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">14</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#2C7A6B]">
            <TrendingDown className="h-3 w-3" /> −2 this week
          </p>
        </div>

        {/* Risk overview chart */}
        <div className="rounded-2xl border border-[#E4E9DE] p-4 sm:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Risk overview</p>
            <span className="text-[10px] font-medium text-[#8A9AA6]">Last 8 weeks</span>
          </div>
          <div className="mt-4 flex h-24 items-end gap-2">
            {bars.map((b, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-[#204654]/85" style={{ height: `${b}%` }} />
            ))}
          </div>
        </div>

        {/* Customer health scores */}
        <div className="rounded-2xl border border-[#E4E9DE] p-4">
          <p className="text-xs font-semibold">Customer health</p>
          <ul className="mt-3 space-y-3">
            {health.map((h) => (
              <li key={h.name}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate font-medium text-[#4A5A6B]">{h.name}</span>
                  <span className="font-semibold">{h.score}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[#E4E9DE]">
                  <div className={`h-full rounded-full ${h.tone}`} style={{ width: `${h.score}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* AI insight */}
        <div className="rounded-2xl bg-[#152238] p-4 text-white sm:col-span-2">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#E0A93A]">
            <Sparkles className="h-3.5 w-3.5" /> AI insight
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/85">
            Bright Fern Co. logged 62% fewer sessions this month and raised 3 billing tickets.
            Historically, this pattern precedes churn within 45 days.
          </p>
        </div>

        {/* Recommended actions */}
        <div className="rounded-2xl border border-[#E4E9DE] p-4">
          <p className="text-xs font-semibold">Recommended actions</p>
          <ul className="mt-3 space-y-2.5 text-[11px] text-[#4A5A6B]">
            {["Call Bright Fern Co. · $42k", "Send usage review · Halcyon", "Offer annual plan · Northwind"].map(
              (a) => (
                <li key={a} className="flex items-center justify-between gap-2 rounded-lg bg-[#F7F9E1] px-2.5 py-2">
                  <span className="truncate">{a}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#204654]" />
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
