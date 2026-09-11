import { describe, expect, it } from "vitest";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  articleFromFile,
  articlesByCategory,
  findArticle,
  parseFrontmatter,
} from "./help-content";
import { parseMarkdown, toEmbed } from "./help-markdown";

describe("parseFrontmatter", () => {
  it("reads keys and returns the body", () => {
    const { data, body } = parseFrontmatter(
      `---\ntitle: "Hello"\ncategory: billing\n---\n\n## Body\ntext`,
    );
    expect(data.title).toBe("Hello");
    expect(data.category).toBe("billing");
    expect(body.startsWith("## Body")).toBe(true);
  });

  it("handles files without frontmatter", () => {
    expect(parseFrontmatter("just text").body).toBe("just text");
  });
});

describe("articleFromFile", () => {
  it("derives slug and category from the path", () => {
    const a = articleFromFile("../content/help/billing/plans.md", "---\ntitle: Plans\n---\nbody");
    expect(a.slug).toBe("plans");
    expect(a.categorySlug).toBe("billing");
    expect(a.order).toBe(999);
  });
});

describe("article index", () => {
  it("ships at least one article per category", () => {
    for (const c of HELP_CATEGORIES) {
      expect(articlesByCategory(c.slug).length).toBeGreaterThan(0);
    }
  });

  it("has a title and description on every article", () => {
    for (const a of HELP_ARTICLES) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it("finds an article by category and slug", () => {
    expect(findArticle("getting-started", "welcome-to-chai")?.title).toContain("Welcome");
    expect(findArticle("getting-started", "nope")).toBeUndefined();
  });
});

describe("toEmbed", () => {
  it("supports youtube, vimeo and loom", () => {
    expect(toEmbed("https://www.youtube.com/watch?v=abc123")?.src).toBe(
      "https://www.youtube.com/embed/abc123",
    );
    expect(toEmbed("https://youtu.be/abc123")?.provider).toBe("youtube");
    expect(toEmbed("https://vimeo.com/12345")?.src).toBe("https://player.vimeo.com/video/12345");
    expect(toEmbed("https://www.loom.com/share/xyz")?.src).toBe("https://www.loom.com/embed/xyz");
  });

  it("ignores other urls", () => {
    expect(toEmbed("https://example.com/page")).toBeNull();
    expect(toEmbed("not a url")).toBeNull();
  });
});

describe("parseMarkdown", () => {
  it("parses headings, lists, emphasis and embeds", () => {
    const blocks = parseMarkdown(
      `## Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. first\n\n> note\n\n![alt](/img.png)\n\nhttps://youtu.be/abc\n`,
    );
    const types = blocks.map((b) => b.type);
    expect(types).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "image",
      "embed",
    ]);
    const para = blocks[1];
    expect(para.type === "paragraph" && para.content.some((n) => n.type === "bold")).toBe(true);
    const ordered = blocks[3];
    expect(ordered.type === "list" && ordered.ordered).toBe(true);
  });

  it("parses links and code fences", () => {
    const blocks = parseMarkdown("See [docs](https://askchai.tech).\n\n```\ncode\n```");
    expect(blocks[0].type === "paragraph" && blocks[0].content.some((n) => n.type === "link")).toBe(
      true,
    );
    expect(blocks[1]).toEqual({ type: "code", text: "code" });
  });
});
