/**
 * vault-bridge — LibStack PWA → knowledge vault round-trip.
 *
 * Endpoints, all authed by a shared secret in the `x-secret` header:
 *   POST /api/notes        → upsert inbox/raw/captures/notes/<slug>.md (overwrite)
 *   POST /api/mark-read    → flip [ ]→[x] for a URL in inbox/reading-queue.md
 *   POST /api/unmark-read  → flip [x]→[ ] for a URL in inbox/reading-queue.md
 *   POST /api/highlights   → append to inbox/notes/highlights/<slug>.md
 *
 * Writes go to GitHub via the Contents API with optimistic concurrency
 * (read sha → conditional PUT → retry on 409). The vault git repo stays
 * source-of-truth; every write is one commit tagged `libstack:`.
 */

interface Env {
  GITHUB_PAT: string;
  SHARED_SECRET: string;
}

const REPO = "sameerhimati/knowledge";
const BRANCH = "main";
const QUEUE_PATH = "inbox/reading-queue.md";
const NOTES_DIR = "inbox/raw/captures/notes";
const HIGHLIGHTS_DIR = "inbox/notes/highlights";
const MAX_BODY_BYTES = 256 * 1024;
const RETRIES = 3;

const ALLOWED_ORIGINS = new Set([
  "https://libstack.itamih.com", // canonical
  "https://reading.itamih.com", // alias (redirects to canonical, but allow pre-redirect calls)
  "http://localhost:3000",
]);

// ── helpers ────────────────────────────────────────────────────────────────

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
  });
}

function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const TRACKING_PARAM = /^utm_/i;
const TRACKING_KEYS = new Set(["fbclid", "gclid", "ref"]);

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const drop: string[] = [];
    for (const k of u.searchParams.keys()) {
      if (TRACKING_PARAM.test(k) || TRACKING_KEYS.has(k.toLowerCase())) drop.push(k);
    }
    for (const k of drop) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch {
    return trimmed.toLowerCase().replace(/\/$/, "");
  }
}

function ghHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "vault-bridge-worker",
  };
}

async function ghGet(
  env: Env,
  path: string,
): Promise<{ sha: string; content: string } | null> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
    { headers: ghHeaders(env) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github GET ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { sha: string; content: string };
  return { sha: j.sha, content: b64decode(j.content) };
}

function ghPut(
  env: Env,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<Response> {
  const body: Record<string, string> = {
    message,
    content: b64encode(content),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  return fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(env), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── endpoint: notes ────────────────────────────────────────────────────────

interface NotePayload {
  slug?: string;
  title?: string;
  url?: string;
  mode?: string;
  body?: string;
}

async function handleNotes(
  env: Env,
  p: NotePayload,
  origin: string | null,
): Promise<Response> {
  if (!p.slug || typeof p.body !== "string") {
    return json(400, { error: "slug and body required" }, origin);
  }
  if (!/^[a-z0-9-]+$/.test(p.slug)) {
    return json(400, { error: "invalid slug" }, origin);
  }
  const path = `${NOTES_DIR}/${p.slug}.md`;
  const header = [
    `# ${p.title || p.slug}`,
    `Source: libstack`,
    `URL: ${p.url || ""}`,
    ...(p.mode ? [`Mode: ${p.mode}`] : []),
    `Updated: ${new Date().toISOString()}`,
  ].join("\n");
  const file = `${header}\n\n${p.body}\n`;

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const existing = await ghGet(env, path);
    const put = await ghPut(
      env,
      path,
      file,
      `libstack: note for ${p.slug}`,
      existing?.sha,
    );
    if (put.ok) return json(200, { ok: true, path }, origin);
    if (put.status === 409) continue; // sha race — re-read and retry
    return json(502, { error: `github ${put.status}`, detail: await put.text() }, origin);
  }
  return json(409, { error: "conflict after retries" }, origin);
}

// ── endpoint: mark-read ────────────────────────────────────────────────────

// Mirrors the parser regex in scripts/build-content.ts: optional [Q|A|H] tag,
// title link, URL in the following (...). Group 1 = checkbox, group 2 = URL.
const QUEUE_LINE = /^-\s+\[( |x)\]\s+(?:\[[QAH]\]\s+)?\[[^\]]+\]\(([^)]+)\)/;

async function handleMarkRead(
  env: Env,
  p: { url?: string },
  origin: string | null,
): Promise<Response> {
  if (!p.url) return json(400, { error: "url required" }, origin);
  const target = normalizeUrl(p.url);

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const file = await ghGet(env, QUEUE_PATH);
    if (!file) return json(500, { error: "reading-queue.md not found" }, origin);

    const lines = file.content.split("\n");
    const hits: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(QUEUE_LINE);
      if (m && normalizeUrl(m[2]) === target) hits.push(i);
    }

    if (hits.length === 0) {
      return json(404, { error: "no queue entry matches", normalized: target }, origin);
    }
    if (hits.length > 1) {
      return json(
        409,
        { error: "multiple queue entries match", lines: hits.map((i) => i + 1), normalized: target },
        origin,
      );
    }

    const i = hits[0];
    if (/^-\s+\[x\]/.test(lines[i])) {
      return json(200, { ok: true, alreadyRead: true, line: i + 1 }, origin);
    }
    lines[i] = lines[i].replace(/^(-\s+\[) (\])/, "$1x$2");

    const put = await ghPut(
      env,
      QUEUE_PATH,
      lines.join("\n"),
      `libstack: mark read — ${target}`,
      file.sha,
    );
    if (put.ok) return json(200, { ok: true, line: i + 1 }, origin);
    if (put.status === 409) continue; // sha race — re-read and retry
    return json(502, { error: `github ${put.status}`, detail: await put.text() }, origin);
  }
  return json(409, { error: "conflict after retries" }, origin);
}

// ── endpoint: unmark-read ──────────────────────────────────────────────────

async function handleUnmarkRead(
  env: Env,
  p: { url?: string },
  origin: string | null,
): Promise<Response> {
  if (!p.url) return json(400, { error: "url required" }, origin);
  const target = normalizeUrl(p.url);

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const file = await ghGet(env, QUEUE_PATH);
    if (!file) return json(500, { error: "reading-queue.md not found" }, origin);

    const lines = file.content.split("\n");
    const hits: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(QUEUE_LINE);
      if (m && normalizeUrl(m[2]) === target) hits.push(i);
    }

    if (hits.length === 0) {
      return json(404, { error: "no queue entry matches", normalized: target }, origin);
    }
    if (hits.length > 1) {
      return json(
        409,
        { error: "multiple queue entries match", lines: hits.map((i) => i + 1), normalized: target },
        origin,
      );
    }

    const i = hits[0];
    if (/^-\s+\[ \]/.test(lines[i])) {
      return json(200, { ok: true, alreadyUnread: true, line: i + 1 }, origin);
    }
    lines[i] = lines[i].replace(/^(-\s+\[)x(\])/i, "$1 $2");

    const put = await ghPut(
      env,
      QUEUE_PATH,
      lines.join("\n"),
      `libstack: unmark read — ${target}`,
      file.sha,
    );
    if (put.ok) return json(200, { ok: true, line: i + 1 }, origin);
    if (put.status === 409) continue; // sha race — re-read and retry
    return json(502, { error: `github ${put.status}`, detail: await put.text() }, origin);
  }
  return json(409, { error: "conflict after retries" }, origin);
}

// ── endpoint: highlights ───────────────────────────────────────────────────
// Append-only: one file per article, entries separated by `---`. Each entry is
// a blockquote (the passage), an optional comment paragraph, and an HTML-comment
// delimiter carrying the ISO timestamp + clientId (so the build parser can split
// reliably and dedupe). Build loader counterpart lives in scripts/build-content.ts.

interface HighlightPayload {
  clientId?: string;
  slug?: string;
  title?: string;
  url?: string;
  quote?: string;
  comment?: string;
}

async function handleHighlights(
  env: Env,
  p: HighlightPayload,
  origin: string | null,
): Promise<Response> {
  if (!p.slug || typeof p.quote !== "string" || !p.quote.trim()) {
    return json(400, { error: "slug and quote required" }, origin);
  }
  if (!/^[a-z0-9-]+$/.test(p.slug)) {
    return json(400, { error: "invalid slug" }, origin);
  }
  const path = `${HIGHLIGHTS_DIR}/${p.slug}.md`;
  const quote = p.quote.trim();
  const ts = new Date().toISOString();
  const blockquote = quote
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const parts = [blockquote];
  if (p.comment && p.comment.trim()) parts.push(p.comment.trim());
  parts.push(`<!-- libstack-highlight: ${ts}${p.clientId ? ` ${p.clientId}` : ""} -->`);
  const entry = parts.join("\n\n");

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const existing = await ghGet(env, path);
    let file: string;
    if (existing) {
      file = `${existing.content.replace(/\s+$/, "")}\n\n---\n\n${entry}\n`;
    } else {
      const header = [
        `# Highlights — ${p.title || p.slug}`,
        `Source: libstack`,
        `URL: ${p.url || ""}`,
      ].join("\n");
      file = `${header}\n\n${entry}\n`;
    }
    const msg = `libstack: highlight — ${quote.slice(0, 40)}${quote.length > 40 ? "…" : ""}`;
    const put = await ghPut(env, path, file, msg, existing?.sha);
    if (put.ok) return json(200, { ok: true, path }, origin);
    if (put.status === 409) continue; // sha race — re-read and retry
    return json(502, { error: `github ${put.status}`, detail: await put.text() }, origin);
  }
  return json(409, { error: "conflict after retries" }, origin);
}

// ── dispatcher ─────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin");
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (req.method !== "POST") {
      return json(405, { error: "POST only" }, origin);
    }
    if (req.headers.get("x-secret") !== env.SHARED_SECRET) {
      return json(401, { error: "unauthorized" }, origin);
    }

    const len = Number(req.headers.get("content-length") || 0);
    if (len > MAX_BODY_BYTES) {
      return json(413, { error: "payload too large" }, origin);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "invalid JSON" }, origin);
    }

    try {
      if (url.pathname === "/api/notes") {
        return await handleNotes(env, payload as NotePayload, origin);
      }
      if (url.pathname === "/api/mark-read") {
        return await handleMarkRead(env, payload as { url?: string }, origin);
      }
      if (url.pathname === "/api/unmark-read") {
        return await handleUnmarkRead(env, payload as { url?: string }, origin);
      }
      if (url.pathname === "/api/highlights") {
        return await handleHighlights(env, payload as HighlightPayload, origin);
      }
      return json(404, { error: "unknown endpoint" }, origin);
    } catch (e) {
      return json(502, { error: "upstream failure", detail: String(e) }, origin);
    }
  },
};
