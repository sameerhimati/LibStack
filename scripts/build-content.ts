#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const VAULT = process.env.VAULT_PATH || path.join(process.env.HOME || "", "Desktop/knowledge");
const QUEUE = path.join(VAULT, "inbox/reading-queue.md");
const OUT = path.join(process.cwd(), "content/articles.json");
const CACHE = path.join(process.cwd(), "content/cache");
const CONCURRENCY = 4;
const TIMEOUT_MS = 15_000;

type Article = {
  slug: string;
  title: string;
  url: string;
  description?: string;
  cluster: string;
  tier?: string;
  read: boolean;
  byline?: string;
  excerpt?: string;
  content?: string;
  fetchedAt?: string;
  fetchError?: string;
  domain: string;
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

    const item = line.match(/^-\s+\[(x| )\]\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*[—-]\s*(.*))?$/);
    if (item && current) {
      const [, mark, title, url, desc] = item;
      const cleanTitle = title.replace(/^@\w+:\s*/, "").replace(/\s+⭐.*$/, "").trim();
      current.articles.push({
        slug: slugify(cleanTitle),
        title: cleanTitle,
        url,
        description: desc?.trim(),
        cluster: current.title,
        tier: currentTier,
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
      content: article.content,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    return { fetchError: e?.message || "fetch failed" };
  }
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
        a.content = cached.content; a.byline = cached.byline; a.excerpt = cached.excerpt;
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

  const library = { generatedAt: new Date().toISOString(), vaultPath: VAULT, clusters };
  writeFileSync(OUT, JSON.stringify(library, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`Summary: ${okCount} fetched, ${skipCount} cached, ${failCount} failed (X/auth links open externally on iPad)`);
}

main();
