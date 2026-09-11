export interface HelpArticle {
  slug: string;
  categorySlug: string;
  title: string;
  description: string;
  order: number;
  body: string;
}

export interface HelpCategory {
  slug: string;
  name: string;
  blurb: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { slug: "getting-started", name: "Getting Started", blurb: "Set up your account and get your first health scores." },
  { slug: "data-integrations", name: "Data & Integrations", blurb: "Connect your tools or upload data by spreadsheet." },
  { slug: "how-to-use-chai", name: "How to Use ChAi", blurb: "Day-to-day workflow across Today, Customers and Planner." },
  { slug: "risk-scores", name: "Understanding Your Risk Scores", blurb: "What the health score and churn probability mean." },
  { slug: "notifications-reporting", name: "Notifications & Reporting", blurb: "Weekly digests, alerts and exports." },
  { slug: "ask-chai", name: "Using Ask ChAi", blurb: "Get plain-English answers from your own data." },
  { slug: "billing", name: "Billing", blurb: "Plans, trials, invoices and changing your subscription." },
  { slug: "team-organisation", name: "Team & Organisation", blurb: "Invite teammates, manage roles and seats." },
  { slug: "faq-troubleshooting", name: "FAQ & Troubleshooting", blurb: "Common questions and quick fixes." },
];

export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw.trim() };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, body: raw.slice(match[0].length).trim() };
}

export function articleFromFile(path: string, raw: string): HelpArticle {
  const { data, body } = parseFrontmatter(raw);
  const parts = path.split("/");
  const fileName = parts[parts.length - 1].replace(/\.md$/, "");
  const folder = parts[parts.length - 2] ?? "";
  const order = Number(data.order);
  return {
    slug: data.slug || fileName,
    categorySlug: data.category || folder,
    title: data.title || fileName,
    description: data.description || "",
    order: Number.isFinite(order) ? order : 999,
    body,
  };
}

const modules = import.meta.glob("../content/help/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const HELP_ARTICLES: HelpArticle[] = Object.entries(modules)
  .map(([path, raw]) => articleFromFile(path, raw))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export function articlesByCategory(categorySlug: string, articles = HELP_ARTICLES) {
  return articles.filter((a) => a.categorySlug === categorySlug);
}

export function findArticle(categorySlug: string, slug: string, articles = HELP_ARTICLES) {
  return articles.find((a) => a.categorySlug === categorySlug && a.slug === slug);
}

export function categoryName(slug: string) {
  return HELP_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}
