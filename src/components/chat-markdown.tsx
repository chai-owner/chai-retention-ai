import { Fragment, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { parseMarkdown, type Block, type Inline } from "@/lib/help-markdown";
import { APP_PAGE_TARGETS, customerTargets, isSafeHref, linkifyInlines } from "@/lib/chat-links";

/**
 * Compact markdown for the Ask ChAi bubble. Reuses the help pages' parser
 * (text-only, never raw HTML); page and customer names become links.
 */
export function ChatMarkdown({
  source,
  customers = [],
}: {
  source: string;
  customers?: { id: string; name: string }[];
}) {
  const navigate = useNavigate();
  const targets = [...APP_PAGE_TARGETS, ...customerTargets(customers)];

  function go(e: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith("/app")) return;
    e.preventDefault();
    void navigate({ href });
  }

  function inline(nodes: Inline[]): ReactNode {
    return linkifyInlines(nodes, targets).map((n, i) => {
      switch (n.type) {
        case "bold":
          return <strong key={i} className="font-semibold">{n.text}</strong>;
        case "italic":
          return <em key={i}>{n.text}</em>;
        case "code":
          return <code key={i} className="rounded bg-background/60 px-1 text-[0.9em]">{n.text}</code>;
        case "link":
          if (!isSafeHref(n.href)) return <Fragment key={i}>{n.text}</Fragment>;
          return (
            <a
              key={i}
              href={n.href}
              onClick={(e) => go(e, n.href)}
              className="font-medium text-primary underline underline-offset-2"
              {...(n.href.startsWith("https://") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            >
              {n.text}
            </a>
          );
        default:
          return <Fragment key={i}>{n.text}</Fragment>;
      }
    });
  }

  function block(b: Block, key: number): ReactNode {
    switch (b.type) {
      case "heading":
        return <p key={key} className="text-[13px] font-semibold">{inline(b.content)}</p>;
      case "paragraph":
      case "quote":
        return <p key={key}>{inline(b.content)}</p>;
      case "list": {
        const Tag = b.ordered ? "ol" : "ul";
        return (
          <Tag key={key} className={`${b.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-4`}>
            {b.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </Tag>
        );
      }
      case "code":
        return <p key={key} className="whitespace-pre-wrap">{b.text}</p>;
      case "image":
        return <p key={key}>{b.alt}</p>;
      default:
        return null; // embeds and rules are never shown in chat
    }
  }

  return <div className="space-y-2 break-words leading-relaxed">{parseMarkdown(source).map(block)}</div>;
}
