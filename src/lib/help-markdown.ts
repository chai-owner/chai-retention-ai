export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; content: Inline[] }
  | { type: "code"; text: string }
  | { type: "image"; src: string; alt: string }
  | { type: "embed"; provider: "youtube" | "vimeo" | "loom"; src: string }
  | { type: "hr" };

/** Turn a bare video URL into an embeddable iframe src, or null if unsupported. */
export function toEmbed(url: string): { provider: "youtube" | "vimeo" | "loom"; src: string } | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") || (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : "");
      if (id) return { provider: "youtube", src: `https://www.youtube.com/embed/${id}` };
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return { provider: "youtube", src: `https://www.youtube.com/embed/${id}` };
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return { provider: "vimeo", src: `https://player.vimeo.com/video/${id}` };
    }
    if (host === "player.vimeo.com") return { provider: "vimeo", src: u.toString() };
    if (host === "loom.com" || host.endsWith(".loom.com")) {
      const segs = u.pathname.split("/").filter(Boolean);
      const id = segs[segs.length - 1];
      if (id && (segs[0] === "share" || segs[0] === "embed")) {
        return { provider: "loom", src: `https://www.loom.com/embed/${id}` };
      }
    }
  } catch {
    return null;
  }
  return null;
}

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", text: text.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push({ type: "bold", text: tok.slice(2, -2) });
    } else if (tok.startsWith("`")) {
      out.push({ type: "code", text: tok.slice(1, -1) });
    } else if (tok.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push({ type: "link", text: link[1], href: link[2] });
    } else {
      out.push({ type: "italic", text: tok.slice(1, -1) });
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.length ? out : [{ type: "text", text }];
}

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4;
      blocks.push({ type: "heading", level, content: parseInline(heading[2]) });
      i++;
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(trimmed);
    if (image) {
      blocks.push({ type: "image", alt: image[1], src: image[2] });
      i++;
      continue;
    }

    if (/^https?:\/\/\S+$/.test(trimmed)) {
      const embed = toEmbed(trimmed);
      if (embed) {
        blocks.push({ type: "embed", ...embed });
        i++;
        continue;
      }
    }

    if (trimmed.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) buf.push(lines[i++].trim().slice(2));
      blocks.push({ type: "quote", content: parseInline(buf.join(" ")) });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/;
    const numbered = /^\d+[.)]\s+(.*)$/;
    if (bullet.test(trimmed) || numbered.test(trimmed)) {
      const ordered = numbered.test(trimmed);
      const re = ordered ? numbered : bullet;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i].trim())) {
        items.push(parseInline(re.exec(lines[i].trim())![1]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>\s|```|[-*]\s|\d+[.)]\s)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", content: parseInline(para.join(" ")) });
  }

  return blocks;
}
