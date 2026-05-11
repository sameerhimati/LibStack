# Session Handoff

> Persistent context between Claude Code sessions. Read at start (`/session-kickoff`), update at end (`/session-handoff`).

---

## Last updated: 2026-05-08 (eve of trip — Phase 1 done + auto-deploy validated end-to-end)

### What just happened — the big arc

Phase 1 closed 9 days early, one Phase 2 item shipped because it was breaking real articles, and the entire vault → CF Pages auto-deploy pipeline got validated with real content. Everything is live on `reading.itamih.com`.

**Phase 1 — done:**
- **Offline trip bundle** (`a7d73fd`) — relative-path bundle for AirDrop fallback
- **PWA + service worker** (`4026074`) — version-stamped SW, 20 precache entries, stale-while-revalidate HTML, cache-first immutable assets, register only on production HTTPS
- **fuse.js client-side search** (same commit) — lazy-loaded, build-time index, server-rendered cluster list preserved as `<HomeShell>` children → SSG intact
- **Cloudflare Pages deploy** at `reading.itamih.com` — custom domain attached, cert valid, served via CF edge
- **GH Action in knowledge repo** (`dd85eb2`, knowledge repo) — push to `inbox/reading-queue.md` triggers rebuild + deploy in ~50s

**Phase 2 — pulled forward + shipped:**
- **KaTeX server-side rendering + `<pre>` overflow fix** (`734a87e`) — DOM-walk over text nodes (skip `pre|code|script|style|[data-no-math]`), match `\[…\]` / `$$…$$` / `\(…\)`, idempotent. MCMC article: 66 KaTeX spans rendered, 0 failed.

**Pipeline validated end-to-end:** 7 new Anthropic eng + Lilian Weng articles added to `inbox/reading-queue.md` → auto-deploy fired on the path filter → all 7 fetched + rendered → live in 53s. No manual step. (`7dc0db2`, knowledge repo.)

### Current live state

- `reading.itamih.com` — 129 queue entries, 19 fetched with full content, 13 KaTeX-rendered articles, 1 with heavy math (MCMC)
- PWA installable on iPhone + iPad via Safari → Share → Add to Home Screen
- Service worker precaches home + 13 articles + manifest + icons + search index
- Auto-deploy: any push to `inbox/reading-queue.md` on main in `sameerhimati/knowledge` → ~50s to live

### Phase 2 v2 — locked scope (post-trip, June+ no-build sprint)

**Dropped from prior scope:**
- Wikilinks resolution
- Browser extension for capture (external tools fine — X bookmarks, paywalls, SPAs all stay out-of-band)

**Confirmed in:**
- Sort & filter (domain, cluster, length, recency, read state, tier)
- Mark as read / mark as reread / archive (the unread-only filter already saves bandwidth + cache space; this is the UX layer on top)
- Per-article notes
- Content render quality: HTML polish, Markdown for direct .md links, PDF support (text extraction or pdf.js inline), Shiki syntax highlighting, KaTeX ✅ shipped
- Type controls (font size, serif/sans, dark mode toggle)
- OG meta tags
- **Video** — YouTube detection + embed; dedicated Video tab with continuous "next video" queue (replaces "open original" for video URLs)
- **Image localization** — download external `<img>` at build time, rewrite URLs to relative paths under `out/article/<slug>/images/`. Closes the only remaining offline gap (~5–10 MB per article-with-images, well within budget).
- **Highlighting** — text selection + `<mark>` + persistence. Ship localStorage first; graduate to a tiny CF Worker + KV (~30 lines, shared-secret auth via localStorage, free tier covers daily use trivially) if cross-device sync becomes a real need. Vault round-trip stays off the table.

**Suggested adds (Sameer to confirm):**
- Reading time estimates (word count → minutes)
- Reading progress (scroll position persisted, localStorage)
- Keyboard shortcuts (`j/k` next/prev, `r` mark read)
- Per-cluster unread badges on home
- "This week" view
- Export-as-markdown clipboard button (respects no-write-back invariant)

### Follow-ups (small, post-trip, do early)

1. **Per-article progress logging in the fetcher** — `build-content.ts` logs every 5 articles; on a flaky network this looks frozen. Add per-article `[i/N] fetching url…` lines + a real disk cache in `content/cache/` (path is created but never written to) so re-runs only hit URLs without content. Sameer hit this tonight.
2. **LibStack-side push-to-deploy workflow** — code changes in LibStack only deploy when run from local. Add `.github/workflows/deploy.yml` in LibStack repo on push to main; same secrets pattern (CF API token + account ID), no cross-repo PAT needed.
3. **Real branded icons** — replace `public/icon-*.png` placeholders before any public sharing.
4. **Trim service worker fallback for `/articles.json`** — content is inlined into HTML at build, so the runtime fetch handler never fires. Either keep it as documented intent or delete. No urgency.

### Decisions made this session

- **Phase 1 pulled forward 9 days** (2026-05-08). Authorized by Sameer; small, contained, all green.
- **One bundled commit for PWA + search** instead of two — the agents' diffs interleaved through `package.json`, `bun.lock`, and `scripts/build-sw.ts`. Splitting required interactive staging that risked breaking interim states.
- **KaTeX server-side, not client** — pre-rendered HTML, no runtime JS, works under `file://` for the offline bundle, no CDN dependency.
- **Image localization in Phase 2 v2** — closes the offline-image gap; was the only content type still depending on network.
- **Highlighting locked: localStorage first → CF Worker+KV second** — vault round-trip stays off the table.
- **Auto-deploy pipeline kept simple** — knowledge-repo Action does the build (has access to both repos), CF Pages receives via direct upload. CF git-integration was rejected because CF can't build LibStack without the vault.

### Blockers / open questions

None blocking. Ready to fly.

### Load-bearing invariant

LibStack writes to the vault are:
1. scoped to explicit contracts defined in `PLAN-vault-bridge.md` (or successor specs)
2. source-tagged in file headers (e.g., `Source: libstack`)
3. auditable — each write produces a single commit with a clear message

The vault git repo remains source-of-truth for all derived state. Adding new write types or new destinations requires a deliberate spec update, not silent expansion.

### Context for next-session Claude

- `reading.itamih.com` is live. CF account: `3665dc371e2496fd438127cf5a335e1c`, project `libstack`.
- Auto-deploy: any push to `inbox/reading-queue.md` on main in `sameerhimati/knowledge` → ~50s to live.
- Three secrets in the knowledge repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LIBSTACK_REPO_PAT`.
- LibStack repo code changes deploy from local with `wrangler pages deploy out --project-name=libstack` (until follow-up #2 lands push-to-deploy).
- `content/cache/` is created but unused — the cache is `articles.json` itself.
- Per `~/.claude/CLAUDE.md`, X bookmarks live in vault. ~109 X URLs short-circuit to "open original." With the extension dropped from Phase 2 v2, this stays.
- Knowledge repo path: `~/Desktop/knowledge/`. Reading queue: `inbox/reading-queue.md`. Cluster headers are `## CLUSTER NAME`; tiers are `### Tier N — name`; entries are `- [ ] [Title](url) — note`.
- Trip: 2026-05-09 → 2026-05-16 road trip, then SF move 2026-05-15 (overlap). Phase 2 v2 work begins post-trip — Sameer flagged he's actively excited to pick it up.
