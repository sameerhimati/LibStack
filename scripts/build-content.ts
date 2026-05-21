#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import katex from "katex";

const VAULT = process.env.VAULT_PATH || path.join(process.env.HOME || "", "Desktop/knowledge");
const QUEUE = path.join(VAULT, "inbox/reading-queue.md");
const NOTES_DIR = path.join(VAULT, "inbox/raw/captures/notes");
const OUT = path.join(process.cwd(), "content/articles.json");
const SEARCH_INDEX = path.join(process.cwd(), "public/search-index.json");
const CACHE = path.join(process.cwd(), "content/cache");
const CONCURRENCY = 4;
const TIMEOUT_MS = 15_000;

type Mode = "Q" | "A" | "H";

type Article = {
  slug: string;
  title: string;
  url: string;
  description?: string;
  cluster: string;
  tier?: string;
  mode?: Mode;
  read: boolean;
  byline?: string;
  excerpt?: string;
  content?: string;
  fetchedAt?: string;
  fetchError?: string;
  domain: string;
  existingNotes?: string;
  existingNotesHtml?: string;
};

type Cluster = { title: string; description?: string; articles: Article[] };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "?"; }
}

function parseQueue(md: string): Cluster[] {
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;
  let currentTier: string | undefined;
  let descriptionPending = false;
  const skipSections = /^(Killed during|Previously Processed|Absorbed by|Reference Shelf|Tools & Tips|Atlas-relevant)/i;
  let skipping = false;

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();

    const h2 = line.match(/^##\s+(.+?)(?:\s+⭐.*)?$/);
    if (h2) {
      const title = h2[1].trim();
      skipping = skipSections.test(title);
      if (skipping) { current = null; continue; }
      current = { title, articles: [] };
      clusters.push(current);
      currentTier = undefined;
      descriptionPending = true;
      continue;
    }
    if (skipping) continue;

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3 && current) { currentTier = h3[1].trim(); continue; }

    if (descriptionPending && current && line.startsWith("*") && line.endsWith("*")) {
      current.description = line.slice(1, -1).trim();
      descriptionPending = false;
      continue;
    }
    if (line && !line.startsWith(">")) descriptionPending = false;

    // Optional mode tag prefix between the checkbox and the title link:
    //   - [ ] [Q] [Title](url) — desc
    //   - [ ] [A] [Title](url)
    //   - [ ] [H] [Title](url)
    // Untagged entries still match (mode is undefined).
    const item = line.match(/^-\s+\[(x| )\]\s+(?:\[([QAH])\]\s+)?\[([^\]]+)\]\(([^)]+)\)(?:\s*[—-]\s*(.*))?$/);
    if (item && current) {
      const [, mark, modeTag, title, url, desc] = item;
      const cleanTitle = title.replace(/^@\w+:\s*/, "").replace(/\s+⭐.*$/, "").trim();
      current.articles.push({
        slug: slugify(cleanTitle),
        title: cleanTitle,
        url,
        description: desc?.trim(),
        cluster: current.title,
        tier: currentTier,
        mode: modeTag as Mode | undefined,
        read: mark === "x",
        domain: domainOf(url),
      });
    }
  }

  const seen = new Set<string>();
  for (const c of clusters) {
    for (const a of c.articles) {
      let s = a.slug; let i = 2;
      while (seen.has(s)) s = `${a.slug}-${i++}`;
      a.slug = s; seen.add(s);
    }
  }
  return clusters.filter((c) => c.articles.length > 0);
}

// Math rendering stats — accumulated across all articles in a build run.
let mathRendered = 0;
let mathFailed = 0;
const mathFailures: string[] = [];

// Match display \[...\], display $$...$$, inline \(...\). Multi-line aware (`s` flag).
// Order matters: try display before inline so \[\] wins over \(\). $$ is its own delimiter.
const MATH_PATTERNS: { re: RegExp; displayMode: boolean }[] = [
  { re: /\\\[([\s\S]+?)\\\]/g, displayMode: true },
  { re: /\$\$([\s\S]+?)\$\$/g, displayMode: true },
  { re: /\\\(([\s\S]+?)\\\)/g, displayMode: false },
];

const SKIP_TAGS = new Set(["PRE", "CODE", "SCRIPT", "STYLE"]);

function renderMath(html: string, articleUrl: string): string {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;
  const NodeFilter = dom.window.NodeFilter;

  // Collect text nodes first (mutating during walk is unsafe).
  const textNodes: Text[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p: Element | null = (node as Text).parentElement;
      while (p) {
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.hasAttribute("data-no-math")) return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) textNodes.push(n as Text);

  for (const text of textNodes) {
    const original = text.data;
    if (!original) continue;
    // Quick reject: if no math delimiter is present, skip.
    if (!/\\\[|\\\(|\$\$/.test(original)) continue;

    // Find all non-overlapping matches across all patterns, sorted by start index.
    type Match = { start: number; end: number; latex: string; displayMode: boolean };
    const matches: Match[] = [];
    for (const { re, displayMode } of MATH_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(original)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, latex: m[1], displayMode });
      }
    }
    if (matches.length === 0) continue;
    matches.sort((a, b) => a.start - b.start);
    // Drop overlaps (earlier match wins).
    const ordered: Match[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.start < cursor) continue;
      ordered.push(m);
      cursor = m.end;
    }

    // Build a fragment: text-before + rendered span + text-after, repeating.
    const frag = doc.createDocumentFragment();
    let pos = 0;
    for (const m of ordered) {
      if (m.start > pos) frag.appendChild(doc.createTextNode(original.slice(pos, m.start)));
      try {
        const rendered = katex.renderToString(m.latex, {
          displayMode: m.displayMode,
          throwOnError: false,
          output: "html",
          strict: "ignore",
        });
        const wrapper = doc.createElement(m.displayMode ? "div" : "span");
        wrapper.innerHTML = rendered;
        // Move children out of wrapper into the fragment so we don't add an extra div/span.
        // Actually keep the wrapper — KaTeX's own span.katex / span.katex-display is what we want;
        // wrapper is just a parsing host. Append its children directly.
        while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
        mathRendered++;
      } catch (e: any) {
        const snippet = original.slice(m.start, m.end);
        mathFailed++;
        const msg = `[math] failed in ${articleUrl}: ${snippet.slice(0, 80)}`;
        if (mathFailures.length < 10) mathFailures.push(msg);
        console.warn(msg);
        frag.appendChild(doc.createTextNode(snippet));
      }
      pos = m.end;
    }
    if (pos < original.length) frag.appendChild(doc.createTextNode(original.slice(pos)));
    text.parentNode?.replaceChild(frag, text);
  }

  return doc.body.innerHTML;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ac.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
  } finally { clearTimeout(t); }
}

async function extractArticle(url: string): Promise<Partial<Article>> {
  if (/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(domainOf(url))) {
    return { fetchError: "x.com requires auth — link only" };
  }
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { fetchError: `HTTP ${res.status}` };
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article || !article.content) return { fetchError: "no readable content" };
    return {
      title: article.title || undefined,
      byline: article.byline || undefined,
      excerpt: article.excerpt || undefined,
      content: renderMath(article.content, url),
      fetchedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    return { fetchError: e?.message || "fetch failed" };
  }
}

// ── existing-notes loader ──────────────────────────────────────────────────
// The vault-bridge worker writes notes to inbox/raw/captures/notes/<slug>.md
// with a header block (`# title`, `Source: libstack`, `URL: ...`, optional
// `Mode: ...`, `Updated: ...`) followed by a blank line and the body. We
// strip the header so the reader only sees the body the user actually wrote.

const NOTE_HEADER_KEY = /^(#\s|Source:|URL:|Mode:|Updated:)/;

function stripNoteHeader(raw: string): string {
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length && NOTE_HEADER_KEY.test(lines[i])) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  return lines.slice(i).join("\n").trim();
}

function loadExistingNote(slug: string): string | undefined {
  const file = path.join(NOTES_DIR, `${slug}.md`);
  if (!existsSync(file)) return undefined;
  try {
    const body = stripNoteHeader(readFileSync(file, "utf8"));
    return body || undefined;
  } catch {
    return undefined;
  }
}

// Minimal markdown → HTML renderer for vault notes. Handles paragraphs,
// ATX headings (h2–h4), unordered/ordered lists, blockquotes, inline links,
// **bold**, *italic*, and `code`. Anything more exotic falls through as
// escaped paragraph text. Notes are usually short, plain, and personal —
// this is intentionally small rather than pulling in a parser dep.

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  let out = escHtml(text);
  // Inline code first so its contents don't get further processed.
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  // Links [label](url) — url already escaped.
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label, url) =>
      `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`,
  );
  // Bold then italic. Use non-greedy.
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return out;
}

function renderNoteMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      flushPara();
      i++;
      continue;
    }

    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = Math.min(Math.max(h[1].length + 1, 2), 5); // bump h1→h2
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote><p>${renderInline(buf.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(`<ul>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(`<ol>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ol>`);
      continue;
    }

    para.push(trimmed);
    i++;
  }
  flushPara();
  return out.join("\n");
}

async function main() {
  if (!existsSync(QUEUE)) { console.error(`Reading queue not found at ${QUEUE}`); process.exit(1); }
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

  console.log(`Parsing ${QUEUE}…`);
  const clusters = parseQueue(readFileSync(QUEUE, "utf8"));
  const total = clusters.reduce((n, c) => n + c.articles.length, 0);
  const toFetch = clusters.flatMap((c) => c.articles).filter((a) => !a.read);
  console.log(`Found ${total} entries across ${clusters.length} clusters · ${toFetch.length} unread to fetch`);

  let cache: Record<string, Article> = {};
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, "utf8"));
      for (const c of prev.clusters || []) for (const a of c.articles || []) cache[a.url] = a;
      console.log(`Loaded ${Object.keys(cache).length} cached entries`);
    } catch {}
  }

  let done = 0; let okCount = 0; let failCount = 0; let skipCount = 0;
  const queue = [...toFetch];

  async function worker() {
    while (queue.length) {
      const a = queue.shift(); if (!a) break;
      const cached = cache[a.url];
      if (cached?.content) {
        a.content = renderMath(cached.content, a.url);
        a.byline = cached.byline; a.excerpt = cached.excerpt;
        a.fetchedAt = cached.fetchedAt; skipCount++;
      } else {
        const r = await extractArticle(a.url);
        Object.assign(a, r);
        if (a.content) okCount++; else failCount++;
      }
      done++;
      if (done % 5 === 0 || done === toFetch.length) {
        console.log(`  ${done}/${toFetch.length}  ok=${okCount} fail=${failCount} cached=${skipCount}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Attach any prior vault notes (written by the vault-bridge worker). Read
  // each per-article note file once at build time and pre-render to HTML so
  // the client doesn't need a markdown parser.
  let notesAttached = 0;
  if (existsSync(NOTES_DIR)) {
    for (const c of clusters) {
      for (const a of c.articles) {
        const body = loadExistingNote(a.slug);
        if (body) {
          a.existingNotes = body;
          a.existingNotesHtml = renderNoteMarkdown(body);
          notesAttached++;
        }
      }
    }
  }
  console.log(`Existing vault notes attached: ${notesAttached}`);

  const library = { generatedAt: new Date().toISOString(), vaultPath: VAULT, clusters };
  writeFileSync(OUT, JSON.stringify(library, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`Summary: ${okCount} fetched, ${skipCount} cached, ${failCount} failed (X/auth links open externally on iPad)`);
  console.log(`Math: ${mathRendered} rendered, ${mathFailed} failed`);

  // Search index: flat list of unread articles with a short snippet for client-side fuse.js.
  const publicDir = path.dirname(SEARCH_INDEX);
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const searchEntries = clusters.flatMap((c) =>
    c.articles
      .filter((a) => !a.read)
      .map((a) => {
        const raw = a.excerpt || (a.content ? stripHtml(a.content) : "") || a.description || "";
        return {
          slug: a.slug,
          title: a.title,
          cluster: c.title,
          domain: a.domain,
          url: a.url,
          mode: a.mode,
          snippet: raw.slice(0, 200),
          hasContent: Boolean(a.content),
        };
      })
  );
  writeFileSync(SEARCH_INDEX, JSON.stringify(searchEntries));
  console.log(`Wrote ${SEARCH_INDEX} (${searchEntries.length} entries)`);
}

main();
