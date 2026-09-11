import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { HELP_ARTICLES, HELP_CATEGORIES, articlesByCategory } from "@/lib/help-content";

export const Route = createFileRoute("/help/")({
  head: () => ({
    meta: [
      { title: "Help Center — ChAi" },
      {
        name: "description",
        content:
          "Guides for getting started with ChAi, connecting your data, understanding risk scores, billing, team management and troubleshooting.",
      },
      { property: "og:title", content: "Help Center — ChAi" },
      {
        property: "og:description",
        content: "Guides and answers for using ChAi, your AI customer retention analyst.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://askchai.tech/help" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://askchai.tech/help" }],
  }),
  component: HelpIndex,
});

function HelpIndex() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HELP_CATEGORIES.map((category) => {
      const articles = articlesByCategory(category.slug).filter(
        (a) => !q || a.title.toLowerCase().includes(q),
      );
      return { category, articles };
    }).filter((g) => g.articles.length > 0);
  }, [query]);

  return (
    <main className="mx-auto max-w-[1000px] px-6 pb-20 lg:px-8">
      <div className="rounded-[24px] bg-[#152238] px-8 py-12 text-[#F7F9E1] sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A9E0F1]">
          ChAi Help Center
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          How can we help?
        </h1>
        <p className="mt-3 max-w-xl text-[#D8E7EF]">
          Guides for setting up ChAi, connecting your data, reading your scores and running your
          retention week.
        </p>

        <div className="relative mt-8 max-w-lg">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A5A6B]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles"
            aria-label="Search help articles"
            className="w-full rounded-[12px] border border-transparent bg-white py-3 pl-11 pr-4 text-[#152238] outline-none placeholder:text-[#8494A5] focus:border-[#CAFFA6] focus:ring-2 focus:ring-[#CAFFA6]/50"
          />
        </div>
        <p className="mt-3 text-sm text-[#A9E0F1]">
          {HELP_ARTICLES.length} articles across {HELP_CATEGORIES.length} categories
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="mt-12 rounded-[16px] border border-[#D8E7EF] bg-white p-8 text-center text-[#4A5A6B]">
          No articles match “{query}”. Try a different word, or email support@askchai.tech.
        </p>
      ) : (
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {groups.map(({ category, articles }) => (
            <section
              key={category.slug}
              className="rounded-[16px] border border-[#D8E7EF] bg-white p-6 shadow-[0_16px_40px_rgba(0,0,0,0.06)]"
            >
              <h2 className="text-lg font-bold tracking-tight text-[#152238]">{category.name}</h2>
              <p className="mt-1 text-sm text-[#4A5A6B]">{category.blurb}</p>
              <ul className="mt-4 space-y-3 border-t border-[#E3F1F8] pt-4">
                {articles.map((article) => (
                  <li key={article.slug}>
                    <Link
                      to="/help/$category/$slug"
                      params={{ category: category.slug, slug: article.slug }}
                      className="group block rounded-[8px]"
                    >
                      <span className="font-semibold text-[#204654] group-hover:text-[#152238]">
                        {article.title}
                      </span>
                      {article.description ? (
                        <span className="mt-0.5 block text-sm text-[#4A5A6B]">
                          {article.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
