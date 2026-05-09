# Session Handoff

> Persistent context between Claude Code sessions. Read at start (`/session-kickoff`), update at end (`/session-handoff`).

---

## Last updated: 2026-05-08 (eve of trip — Phase 1 shipped + KaTeX pulled forward)

### What just happened

Phase 1 closed early (~9 days ahead of the locked 2026-05-17 → 2026-05-22 window) and one Phase 2 item shipped tonight because it was breaking real articles.

**Phase 1 — done:**
- **PWA** (`4026074`) — web manifest, placeholder icons, hand-rolled SW built into `out/sw.js` (version-stamped from `Library.generatedAt`, 20 precache entries, stale-while-revalidate for HTML, cache-first for `_next/static`, network-first for JSON). `RegisterSW.tsx` only registers on production HTTPS so dev + offline-bundle paths stay no-op.
- **Search** (same commit) — fuse.js client-side, lazy-loaded on first focus over a build-time `public/search-index.json` (122 entries, 13 with content, ~34 KB). Server-rendered cluster list preserved as `<HomeShell>` children → SSG intact. `/` focuses input, `Esc` clears.
- **Cloudflare Pages deploy** — `libstack` project on account `3665dc371e2496fd438127cf5a335e1c`. Custom domain `reading.itamih.com` attached, cert valid, served via CF edge.
- **GH Action in knowledge repo** (`dd85eb2`) — `.github/workflows/rebuild-libstack.yml` triggers on push to `inbox/reading-queue.md` (or manually). Checks out knowledge + LibStack, builds against the vault, deploys to CF Pages. Took two iterations: first run failed because runner Node 20 < wrangler 4.x required Node 22 — fixed with `actions/setup-node`. Run 25588459062 succeeded in 52s.

**Phase 2 — pulled forward:**
- **KaTeX + `<pre>` overflow** (`734a87e`) — server-side math rendering in `build-content.ts`. DOM-walk over text nodes, skips `pre|code|script|style|[data-no-math]`, matches `\[…\]` / `$$…$$` / `\(…\)` (multi-line aware), per-expression try/catch, idempotent because it only matches raw delimiters. KaTeX CSS imported in `globals.css`; `<pre>` and `.katex-display` get `overflow-x:auto`. MCMC article: 66 KaTeX spans rendered, 0 failed. Shipped because the math article was unreadable on `reading.itamih.com`.

### Current state

- [x] All Phase 1 items done + deployed live at `reading.itamih.com`
- [x] Auto-deploy pipeline verified end-to-end (vault push → CF Pages live in ~50s)
- [x] Math + code-block fix shipped + verified live (15+ KaTeX matches in deployed MCMC HTML)
- [ ] iPad PWA install + offline test (was open before trip — Sameer to do, takes 60s on the iPad)
- [ ] Real branded icons (placeholders ship today — `LS` wordmark on solid background; replace before any public sharing)

### Refreshed Phase 2 scope (post-trip, June+ no-build sprint)

Sameer trimmed and added on 2026-05-08. Locked-list memory updated.

**Dropped from prior scope:**
- Wikilinks resolution
- Browser extension for capture (external tools fine — X bookmarks, paywalls, SPAs all stay out-of-band)

**Confirmed in (locked 2026-05-08):**
- Sort & filter (domain, cluster, length, recency, read state, tier)
- Mark as read / mark as reread / archive
- Per-article notes
- Content render quality: HTML polish, Markdown for direct .md links, PDF support (text extraction or pdf.js inline), Shiki syntax highlighting, KaTeX ✅ shipped
- Type controls (font size, serif/sans, dark mode toggle)
- OG meta tags
- **Video** — YouTube detection + embed; dedicated Video tab with continuous "next video" queue (replaces "open original" for video URLs)
- **Image localization** — download external `<img>` at build time, rewrite URLs to relative paths under `out/article/<slug>/images/`. Closes the only remaining offline gap. Adds maybe 5–10 MB per article-with-images to the cache; budget is fine.
- **Highlighting** — text selection + `<mark>` wrapping + persistence. Recommendation: ship localStorage first (one device, no auth, fast). If cross-device sync becomes a real need, graduate to a tiny CF Worker + KV (`api.reading.itamih.com/api/highlights/<slug>`, ~30 lines, shared-secret auth via localStorage). Vault round-trip stays off the table.

**Suggested adds (Sameer to confirm):**
- Reading time estimates (word count → minutes)
- Reading progress (scroll position persisted, localStorage)
- Keyboard shortcuts (`j/k` next/prev, `r` mark read)
- Per-cluster unread badges on home
- "This week" view
- Export-as-markdown clipboard button (respects no-write-back invariant)

### Follow-ups (small, post-trip)

1. **Per-article progress logging in the fetcher** — `build-content.ts` currently logs every 5 articles; on a flaky network this looks frozen. Add per-article `[i/N] fetching url…` lines + a real disk cache in `content/cache/` (path is created but never written to) so re-runs only hit URLs without content.
2. **LibStack-side push-to-deploy workflow** — today, code changes in LibStack only deploy when run from local. Add `.github/workflows/deploy.yml` in LibStack repo that triggers on push to main; uses the same secrets pattern (CF API token + account ID) but no need for the cross-repo PAT.
3. **Real branded icons** — replace `public/icon-*.png` placeholders.
4. **Trim service worker fallback for `/articles.json`** — content is inlined into HTML at build, so the runtime fetch handler never fires. Either keep it as documented intent or delete it. No urgency.

### Decisions

- **Phase 1 pulled forward 9 days** (2026-05-08). Sameer greenlit autonomous execution; trip starts tomorrow but the work was small and contained. No regret — it works, it's deployed.
- **One bundled commit for PWA + search** (vs. two split commits) because the agents' diffs interleaved through `package.json`, `bun.lock`, and `scripts/build-sw.ts`. Splitting required interactive staging that risked breaking interim states. The commit message describes both.
- **KaTeX server-side, not client** — pre-rendered HTML, no runtime JS, works under `file://` for the offline bundle, no CDN dependency.
- **Notes invariant preserved** — even with notes/highlights moving into Phase 2 v2, "LibStack is a derived view, never writes back to the vault" stays load-bearing. Sidecar state repo if sync is needed.

### Blockers / open questions

- None blocking. Trip starts 2026-05-09; pick up post-2026-05-16.

### Load-bearing invariant

LibStack is a **derived view, never writes back to the vault.** Notes/highlights in Phase 2 v2 must respect this — localStorage is fine, sidecar state repo is fine, vault round-trip is not.

### Context for next-session Claude

- `reading.itamih.com` is live and serving. CF account: `3665dc371e2496fd438127cf5a335e1c`, project `libstack`, custom domain attached, cert valid.
- Auto-deploy: any push to `inbox/reading-queue.md` on main in `sameerhimati/knowledge` triggers `rebuild-libstack.yml` → fresh build → CF Pages deploy in ~50s.
- Three secrets live in the knowledge repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LIBSTACK_REPO_PAT`.
- LibStack repo code changes deploy from local with `wrangler pages deploy out --project-name=libstack` (until follow-up #2 lands).
- `content/cache/` is created but unused — the cache is `articles.json` itself. Disk cache is a planned follow-up.
- Per `~/.claude/CLAUDE.md`, X bookmarks live in vault; reading-queue clusters group them. ~109 X URLs short-circuit to "open original" — extension is dropped from Phase 2 so this stays.
- Trip: Sameer is on a road trip 2026-05-09 → 2026-05-16, then SF move on 2026-05-15 (overlap). Phase 2 v2 work begins post-trip.
