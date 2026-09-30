import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));

import { ChatMarkdown } from "./chat-markdown";
import { ASK_CHAI_STYLE_RULES } from "@/lib/ai.functions";

const render = (s: string, customers: { id: string; name: string }[] = []) =>
  renderToStaticMarkup(<ChatMarkdown source={s} customers={customers} />);

describe("Ask ChAi answer rendering", () => {
  it("renders bold and lists with no visible asterisks", () => {
    const html = render("Focus on your riskiest accounts.\n\n- **Call them** this week\n- **Review** scores\n\n1. First\n2. Second");
    expect(html).toContain("<strong");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html.match(/<li>/g)?.length).toBe(4);
    expect(html).not.toContain("*");
  });

  it("links app page names, including bold ones", () => {
    const html = render("Open the **Risk Center**, then check Data Quality and Identity Resolution.");
    expect(html).toContain('href="/app/customers"');
    expect(html).toContain('href="/app/data-quality"');
    expect(html).toContain('href="/app/identity"');
    expect(html).not.toContain("*");
  });

  it("does not link the ordinary word 'Today' mid-sentence, but does link the Today page", () => {
    expect(render("Today, call them.")).not.toContain("href");
    expect(render("See the Today page.")).toContain('href="/app/today"');
  });

  it("links identifiable customers to their profile, skipping ambiguous names", () => {
    const html = render("Email Northstar Legal and Acme.", [
      { id: "c1", name: "Northstar Legal" },
      { id: "c2", name: "Acme" },
      { id: "c3", name: "Acme" },
    ]);
    expect(html).toContain('href="/app/customers/c1"');
    expect(html).not.toContain("/app/customers/c2");
  });

  it("never renders raw HTML or unsafe links", () => {
    const html = render('<script>alert(1)</script> <b>x</b> [bad](javascript:alert(1)) [ext](http://evil.test)');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("http://evil.test");
  });
});

describe("Ask ChAi prompt rules", () => {
  it("asks for the direct-answer + bolded-bullets shape and forbids invented features/numbers", () => {
    expect(ASK_CHAI_STYLE_RULES).toMatch(/one-sentence direct answer/);
    expect(ASK_CHAI_STYLE_RULES).toMatch(/2-5 short bullets/);
    expect(ASK_CHAI_STYLE_RULES).toMatch(/120 words/);
    expect(ASK_CHAI_STYLE_RULES).toMatch(/does NOT send emails.*automate check-ins/s);
    expect(ASK_CHAI_STYLE_RULES).toMatch(/Never invent/);
  });
});
