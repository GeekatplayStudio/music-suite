/**
 * Just enough Markdown for the user manual, turned into plain data the Help page renders.
 *
 * The manual lives in docs/USER_MANUAL.md so it reads well on GitHub and in any editor; the
 * Help page reads the same file when the app is built. Supported: headings, paragraphs,
 * bullet and numbered lists (nested by indentation), tables, quotes (shown as tips), fenced
 * code, rules, and inline code, bold, italics and links. Heading anchors follow GitHub's
 * rules, so a link to a section works in both places.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export interface ListItem {
  content: Inline[];
  children: Block | null;
}

export type Block =
  | { t: "heading"; level: number; id: string; c: Inline[]; text: string }
  | { t: "para"; c: Inline[] }
  | { t: "list"; ordered: boolean; items: ListItem[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "quote"; blocks: Block[] }
  | { t: "code"; v: string }
  | { t: "rule" };

export interface HelpSection {
  id: string;
  title: string;
  /** Sub-headings, for the contents list. */
  parts: { id: string; title: string }[];
  blocks: Block[];
  /** Everything in the section as plain lower-case text, for search. */
  text: string;
}

export interface HelpDocument {
  title: string;
  intro: Block[];
  sections: HelpSection[];
}

/** A heading's anchor as GitHub makes it: lower case, punctuation dropped, spaces to hyphens. */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/* ------------------------------------------------------------------ inline */

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest.startsWith("\\") && rest.length > 1) {
      text += rest[1];
      i += 2;
      continue;
    }
    if (rest.startsWith("`")) {
      const end = source.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ t: "code", v: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = source.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((rest.startsWith("*") || rest.startsWith("_")) && !/\s/.test(rest[1] ?? " ")) {
      const mark = rest[0];
      const end = source.indexOf(mark, i + 1);
      // An underscore inside a word (snake_case) is not emphasis.
      const wordBefore = mark === "_" && /\w/.test(source[i - 1] ?? "");
      if (end > i + 1 && !wordBefore) {
        flush();
        out.push({ t: "em", c: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("[")) {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (match) {
        flush();
        out.push({ t: "link", href: match[2], c: parseInline(match[1]) });
        i += match[0].length;
        continue;
      }
    }
    text += source[i];
    i += 1;
  }
  flush();
  return out;
}

export function plainText(nodes: Inline[]): string {
  return nodes.map((node) => (node.t === "text" || node.t === "code" ? node.v : plainText(node.c))).join("");
}

/* ------------------------------------------------------------------ blocks */

const LIST_ITEM = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = LIST_ITEM.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const match = LIST_ITEM.exec(lines[i]);
    if (!match || match[1].length !== indent) break;
    let content = match[3];
    i += 1;
    // A line that continues the item's text without being a new item.
    while (i < lines.length && lines[i].trim() && !LIST_ITEM.exec(lines[i]) && /^\s+/.test(lines[i])) {
      content += ` ${lines[i].trim()}`;
      i += 1;
    }
    let children: Block | null = null;
    const deeper = i < lines.length ? LIST_ITEM.exec(lines[i]) : null;
    if (deeper && deeper[1].length > indent) {
      const nested = parseList(lines, i);
      children = nested.block;
      i = nested.next;
    }
    items.push({ content: parseInline(content), children });
  }
  return { block: { t: "list", ordered, items }, next: i };
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  // A translated manual keeps the English anchors (the app links to them) with a line
  // `<a id="english-anchor"></a>` just before the heading, which GitHub understands too.
  let anchor: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const named = /^<a id="([\w-]+)"><\/a>\s*$/.exec(line.trim());
    if (named) {
      anchor = named[1];
      i += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      const c = parseInline(heading[2]);
      const text = plainText(c);
      blocks.push({ t: "heading", level: heading[1].length, id: anchor ?? slugOf(text), c, text });
      anchor = null;
      i += 1;
      continue;
    }
    anchor = null;
    if (line.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      blocks.push({ t: "code", v: body.join("\n") });
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ t: "rule" });
      i += 1;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]).map(parseInline));
      blocks.push({ t: "table", head, rows });
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ t: "quote", blocks: parseBlocks(body.join("\n")) });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !lines[i].startsWith("```") &&
      !lines[i].trim().startsWith("|")
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push({ t: "para", c: parseInline(para.join(" ")) });
  }
  return blocks;
}

function blockText(block: Block): string {
  switch (block.t) {
    case "heading":
      return block.text;
    case "para":
      return plainText(block.c);
    case "list":
      return block.items.map((item) => `${plainText(item.content)} ${item.children ? blockText(item.children) : ""}`).join(" ");
    case "table":
      return [block.head, ...block.rows].map((row) => row.map(plainText).join(" ")).join(" ");
    case "quote":
      return block.blocks.map(blockText).join(" ");
    case "code":
      return block.v;
    default:
      return "";
  }
}

/** The manual split into its top-level (##) sections, each with its sub-headings and searchable text. */
export function parseHelp(source: string): HelpDocument {
  const blocks = parseBlocks(source);
  let title = "Help";
  const intro: Block[] = [];
  const sections: HelpSection[] = [];
  for (const block of blocks) {
    if (block.t === "heading" && block.level === 1) {
      title = block.text;
      continue;
    }
    if (block.t === "heading" && block.level === 2) {
      sections.push({ id: block.id, title: block.text, parts: [], blocks: [], text: "" });
      continue;
    }
    const current = sections[sections.length - 1];
    if (!current) {
      intro.push(block);
      continue;
    }
    if (block.t === "heading" && block.level === 3) current.parts.push({ id: block.id, title: block.text });
    current.blocks.push(block);
  }
  for (const section of sections) section.text = `${section.title} ${section.blocks.map(blockText).join(" ")}`.toLowerCase();
  return { title, intro, sections };
}
