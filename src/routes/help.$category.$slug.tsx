import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight, ThumbsDown, ThumbsUp } from "lucide-react";
import { Markdown } from "@/components/help/markdown";
import { articlesByCategory, categoryName, findArticle } from "@/lib/help-content";

export const Route = createFileRoute("/help/$category/$slug")({
  loader: ({ params }) => {
    const article = findArticle(params.category, params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ params, loaderData }) => {
    const article = loaderData?.article;
    const url = `https://askchai.tech/help/${params.category}/${params.slug}`;
    if (!article) {
      return {
        meta: [{ title: "Article not found — ChAi Help" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${article.title} — ChAi Help`;
    return {
      meta: [
        { title },
        { name: "description", content: article.description },
        { property: "og:title", content: title },
        { property: "og:description", content: article.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: article.description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.description,
            mainEntityOfPage: url,
          }),
        },
      ],
    };
  },
  notFoundComponent: ArticleNotFound,
  component: ArticlePage,
});

function ArticleNotFound() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-20 text-center lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-[#152238]">
        We couldn't find that article
      </h1>
      <p className="mt-3 text-[#4A5A6B]">It may have been renamed or moved.</p>
      <Link
        to="/help"
        className="mt-6 inline-flex rounded-[12px] bg-[#204654] px-5 py-2.5 text-sm font-semibold text-[#F7F9E1] hover:bg-[#152238]"
      >
        Back to the Help Center
      </Link>
    </main>
  );
}

function HelpfulWidget() {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);

  if (answer) {
    return (
      <div className="mt-12 rounded-[16px] border border-[#CAFFA6] bg-[#F7F9E1]/70 p-6 text-[#152238]">
        <p className="font-semibold">Thanks for the feedback.</p>
        <p className="mt-1 text-sm text-[#4A5A6B]">
          {answer === "yes"
            ? "Glad this helped."
            : "Sorry this missed the mark — email support@askchai.tech and we'll help directly."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-12 rounded-[16px] border border-[#D8E7EF] bg-white p-6">
      <p className="font-semibold text-[#152238]">Was this article helpful?</p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => setAnswer("yes")}
          className="inline-flex items-center gap-2 rounded-[12px] border border-[#D8E7EF] px-4 py-2 text-sm font-semibold text-[#204654] hover:border-[#204654] hover:bg-[#E3F1F8]"
        >
          <ThumbsUp className="h-4 w-4" /> Yes
        </button>
        <button
          type="button"
          onClick={() => setAnswer("no")}
          className="inline-flex items-center gap-2 rounded-[12px] border border-[#D8E7EF] px-4 py-2 text-sm font-semibold text-[#204654] hover:border-[#204654] hover:bg-[#E3F1F8]"
        >
          <ThumbsDown className="h-4 w-4" /> No
        </button>
      </div>
    </div>
  );
}

function ArticlePage() {
  const { article } = Route.useLoaderData();
  const related = articlesByCategory(article.categorySlug).filter((a) => a.slug !== article.slug);

  return (
    <main className="mx-auto max-w-[760px] px-6 pb-20 lg:px-8">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-sm text-[#4A5A6B]"
      >
        <Link to="/help" className="rounded-[8px] hover:text-[#204654]">
          Help Center
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#204654]">{categoryName(article.categorySlug)}</span>
      </nav>

      <article className="mt-6 rounded-[24px] border border-[#D8E7EF] bg-white p-8 shadow-[0_16px_40px_rgba(0,0,0,0.06)] sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#204654]">
          {categoryName(article.categorySlug)}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#152238]">
          {article.title}
        </h1>
        {article.description ? (
          <p className="mt-3 text-lg text-[#4A5A6B]">{article.description}</p>
        ) : null}
        <hr className="mt-8 border-[#E3F1F8]" />
        <Markdown source={article.body} />
      </article>

      <HelpfulWidget />

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4A5A6B]">
            More in {categoryName(article.categorySlug)}
          </h2>
          <ul className="mt-4 space-y-2">
            {related.map((a) => (
              <li key={a.slug}>
                <Link
                  to="/help/$category/$slug"
                  params={{ category: a.categorySlug, slug: a.slug }}
                  className="rounded-[8px] font-medium text-[#204654] hover:text-[#152238]"
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
