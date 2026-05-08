# LibStack Roadmap

The compounding goal: as the reading-queue and vault grow, LibStack scales with zero extra effort. Each phase compounds.

---

## Phase 0 — Trip bundle MVP (now, before 2026-05-09)

Goal: Sameer takes the iPad on a 7-day road trip with no internet and reads 10+ articles from the queue.

- [x] Project scaffolded
- [x] Queue parser (handles `## cluster`, `### tier`, `- [ ] [title](url) — desc`)
- [x] Fetcher with Readability extraction + cache
- [x] Cluster list page
- [x] Article reader page
- [x] Static export (`output: "export"`)
- [ ] First successful end-to-end build with real queue data
- [ ] Test bundle on iPad (open `out/index.html` in Safari, verify offline)

Acceptance: AirDrop `out/` to iPad, open offline, read at least 5 fetched articles cleanly.

---

## Phase 1 — PWA + deploy (post-trip, 2026-05-17 → 2026-05-22)

Goal: `reading.itamih.com` lives, updates automatically when the vault repo is pushed.

- [ ] PWA manifest + service worker (cache article JSON + pages for offline)
- [ ] Deploy decision: Cloudflare Pages vs Vercel vs GitHub Pages on `itamih.github.io/reading`
- [ ] DNS for `reading.itamih.com` (if subdomain chosen)
- [ ] GitHub Action in the knowledge repo: on push to `inbox/reading-queue.md`, trigger LibStack rebuild
- [ ] CI build runs `bun run build` and deploys `out/`
- [ ] Verify offline behavior on iPhone Safari (PWA install prompt, cache survives airplane mode)

Acceptance: push a new article URL to the vault, see it appear on `reading.itamih.com` within 5 minutes, read it offline on the phone.

---

## Phase 2 — Vault integration (June+, fits the deliberate June "no-build" sprint as OS-layer work)

Goal: LibStack becomes the reading + thinking surface, not just a reader. Compounds the vault's existing reading-notes/ pattern.

- [ ] Read `research/reading-notes/<cluster>.md` and surface entries inline next to each article
- [ ] Resolve `[[wikilinks]]` in reading-notes to vault notes (cross-link to `ideas/`, `projects/<name>/`)
- [ ] Search: full-text across articles + reading-notes + atomic notes
- [ ] Reading progress (localStorage MVP, then commit-as-state)
- [ ] Highlights: select text → save as a commit to the vault as a note in `research/reading-notes/`
- [ ] NotebookLM audio link surfacing (when present)

Acceptance: read an article, highlight a line, watch it appear as a note in the vault git log within seconds.

---

## Phase 3 — Compounding edges (later, opportunistic)

Not committed to. Listed so they don't get forgotten.

- [ ] Mobile capture: paste a URL on phone, trigger fetch + commit to `inbox/reading-queue.md`
- [ ] AI summary per article (Claude API, cached)
- [ ] Cross-article wikigraph (article A cites article B, render as graph)
- [ ] Reading streaks / cadence visualization
- [ ] Multi-vault support (if Sameer ever has separate work/personal vaults)

---

## Out of scope

- Authentication — vault is private but LibStack render is public. If something is sensitive, it doesn't go in `inbox/reading-queue.md`.
- Comments / social — not the point of this tool.
- Re-implementing Obsidian — LibStack is reading-only; editing happens in Obsidian or the vault directly.
