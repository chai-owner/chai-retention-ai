import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/help-markdown";

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "bold":
        return <strong key={i} className="font-semibold text-[#152238]">{n.text}</strong>;
      case "italic":
        return <em key={i}>{n.text}</em>;
      case "code":
        return (
          <code key={i} className="rounded bg-[#E3F1F8] px-1.5 py-0.5 text-[0.9em] text-[#204654]">
            {n.text}
          </code>
        );
      case "link": {
        const external = /^https?:\/\//.test(n.href);
        return (
          <a
            key={i}
            href={n.href}
            className="font-medium text-[#204654] underline underline-offset-2 hover:text-[#152238]"
            {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
          >
            {n.text}
          </a>
        );
      }
      default:
        return <Fragment key={i}>{n.text}</Fragment>;
    }
  });
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}` as "h2" | "h3" | "h4");
      const size =
        block.level === 2 ? "mt-10 text-2xl" : block.level === 3 ? "mt-8 text-xl" : "mt-6 text-lg";
      return (
        <Tag key={key} className={`${size} font-bold tracking-tight text-[#152238]`}>
          {renderInline(block.content)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="mt-4 leading-7 text-[#3A4A5C]">
          {renderInline(block.content)}
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol key={key} className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-[#3A4A5C]">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="mt-4 list-disc space-y-2 pl-6 leading-7 text-[#3A4A5C]">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="mt-6 rounded-r-[12px] border-l-4 border-[#CAFFA6] bg-[#F7F9E1]/60 px-5 py-4 text-[#3A4A5C]"
        >
          {renderInline(block.content)}
        </blockquote>
      );
    case "code":
      return (
        <pre
          key={key}
          className="mt-6 overflow-x-auto rounded-[12px] bg-[#152238] p-4 text-sm text-[#F7F9E1]"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "image":
      return (
        <img
          key={key}
          src={block.src}
          alt={block.alt}
          loading="lazy"
          className="mt-6 w-full rounded-[16px] border border-[#D8E7EF] shadow-[0_16px_40px_rgba(0,0,0,0.10)]"
        />
      );
    case "embed":
      return (
        <div
          key={key}
          className="mt-6 aspect-video w-full overflow-hidden rounded-[16px] border border-[#D8E7EF] bg-[#152238]"
        >
          <iframe
            src={block.src}
            title={`${block.provider} video`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      );
    case "hr":
      return <hr key={key} className="mt-8 border-[#D8E7EF]" />;
    default:
      return null;
  }
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return <div className="text-[15px]">{blocks.map(renderBlock)}</div>;
}
