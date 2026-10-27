import type { ArticleContent, ArticleContentBlock } from "@platform/website-engine";

export function articleBodyFromText(input: string): ArticleContent {
  const blocks: ArticleContentBlock[] = [];
  let paragraph: string[] = [];
  let list: { style: "ordered" | "unordered"; items: string[] } | null = null;
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push({ type: "list", ...list });
    list = null;
  };
  for (const rawLine of input.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    const quote = /^>\s+(.+)$/.exec(line);
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ type: "heading", level: heading[1].length as 2 | 3, text: heading[2] });
    } else if (quote) {
      flushParagraph(); flushList();
      blocks.push({ type: "quote", text: quote[1] });
    } else if (unordered || ordered) {
      flushParagraph();
      const style = unordered ? "unordered" : "ordered";
      if (list && list.style !== style) flushList();
      list ??= { style, items: [] };
      list.items.push((unordered ?? ordered)![1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return { version: 1, blocks };
}

export function articleBodyToText(content: ArticleContent) {
  return content.blocks.map((block) => {
    if (block.type === "heading") return `${"#".repeat(block.level)} ${block.text}`;
    if (block.type === "quote") return `> ${block.text}`;
    if (block.type === "list") return block.items.map((item, index) => block.style === "ordered" ? `${index + 1}. ${item}` : `- ${item}`).join("\n");
    return block.text;
  }).join("\n\n");
}

export function tagsFromText(input: string) {
  return input.split(",").map((tag) => tag.trim()).filter(Boolean);
}

export function sourcesFromText(input: string) {
  return input.replaceAll("\r\n", "\n").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("|");
    return separator < 0
      ? { url: line }
      : { label: line.slice(0, separator).trim() || undefined, url: line.slice(separator + 1).trim() };
  });
}

export function sourcesToText(sources: Array<{ label?: string; url: string }>) {
  return sources.map((source) => source.label ? `${source.label} | ${source.url}` : source.url).join("\n");
}
