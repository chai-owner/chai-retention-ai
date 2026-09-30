import type { Inline } from "@/lib/help-markdown";

/**
 * Ask ChAi answer linking: turns app page names and known customer names in
 * a parsed answer into links. Pure, so it can be unit-tested.
 */

export interface LinkTarget {
  /** Exact, case-sensitive phrase to match. */
  phrase: string;
  href: string;
  /** Only link when the whole inline node is exactly this phrase (e.g. bold "Today"). */
  exactOnly?: boolean;
}

// Longest phrases first so "Customer Risk Center" wins over "Risk Center".
export const APP_PAGE_TARGETS: LinkTarget[] = [
  { phrase: "Customer Risk Center", href: "/app/customers" },
  { phrase: "Data Uploads & Integrations", href: "/app/data" },
  { phrase: "Insights & Benchmarks", href: "/app/insights" },
  { phrase: "Churned & Win-back", href: "/app/churned" },
  { phrase: "Intelligence Planner", href: "/app/planner" },
  { phrase: "Identity Resolution", href: "/app/identity" },
  { phrase: "Business Profile", href: "/app/settings" },
  { phrase: "Data Quality", href: "/app/data-quality" },
  { phrase: "Risk Center", href: "/app/customers" },
  { phrase: "Today page", href: "/app/today" },
  { phrase: "Dashboard", href: "/app/dashboard" },
  { phrase: "Insights", href: "/app/insights" },
  // "Today" is an ordinary word — only link it when it stands alone (e.g. **Today**).
  { phrase: "Today", href: "/app/today", exactOnly: true },
];

/** Only in-app paths and https links are ever rendered as links. */
export function isSafeHref(href: string): boolean {
  if (href.startsWith("/app/") || href === "/app") return !href.startsWith("//");
  return /^https:\/\/[^\s]+$/i.test(href);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function customerTargets(customers: { id: string; name: string }[]): LinkTarget[] {
  const counts = new Map<string, number>();
  for (const c of customers) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return customers
    .filter((c) => c.name.trim().length >= 4 && counts.get(c.name) === 1) // skip ambiguous names
    .map((c) => ({ phrase: c.name, href: `/app/customers/${encodeURIComponent(c.id)}` }));
}

function splitText(text: string, targets: LinkTarget[]): Inline[] {
  const exact = targets.find((t) => t.phrase === text.trim());
  if (exact) return [{ type: "link", text, href: exact.href }];
  const usable = targets.filter((t) => !t.exactOnly).sort((a, b) => b.phrase.length - a.phrase.length);
  if (!usable.length) return [{ type: "text", text }];
  const re = new RegExp(`(?<![\\w])(${usable.map((t) => escapeRe(t.phrase)).join("|")})(?![\\w])`, "g");
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", text: text.slice(last, idx) });
    const t = usable.find((u) => u.phrase === m[1])!;
    out.push({ type: "link", text: m[1], href: t.href });
    last = idx + m[1].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.length ? out : [{ type: "text", text }];
}

export function linkifyInlines(nodes: Inline[], targets: LinkTarget[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    if (n.type === "text") {
      out.push(...splitText(n.text, targets));
    } else if (n.type === "bold") {
      // "**[Risk Center](/app/customers)**" — the parser keeps it as bold text.
      const md = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(n.text);
      if (md) {
        out.push({ type: "link", text: md[1], href: md[2] });
        continue;
      }
      const parts = splitText(n.text, targets);
      // Keep plain bold where nothing matched; linked phrases become links.
      for (const p of parts) out.push(p.type === "text" ? { type: "bold", text: p.text } : p);
    } else {
      out.push(n);
    }
  }
  return out;
}
