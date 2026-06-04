# LibStack Roadmap

LibStack is a personal reading viewer for Sameer's knowledge vault.

**Stance:** single-user, my-tool-for-me. The vault is the source of truth; LibStack is a derived view that compounds with the vault's other tooling. Productization (BYO-vault SaaS, OSS template, vault-bridge-as-primitive) is an explicit *parked* thread — see auto-memory `project_libstack_product_thread.md`. Revisit post-MVP.

The compounding goal: as the reading-queue and vault grow, LibStack scales with zero extra effort.

---

## Shipped — historical anchor

Kept for context. Phases closed; everything below is live at `libstack.itamih.com` (canonical; `reading.itamih.com` + `libstack.pages.dev` are aliases that redirect here).

### Phase 0 — Trip bundle MVP (closed early May 2026)

Goal: AirDrop offline-ready reading bundle to iPad for a 7-day road trip.

Project scaffolded · queue parser (`## CLUSTER`, mode tiers, `- [ ] [title](url) — desc`) · Readability fetcher + cache · cluster list + article reader · static export (`output: "export"`) · end-to-end build validated against real queue · iPad-tested offline.

### Phase 1 — PWA + deploy (closed 2026-05-08, 9 days early)

Goal: `libstack.itamih.com` lives and updates automatically when the vault repo is pushed.

PWA manifest + SW (offline article cache) · Cloudflare Pages deploy · DNS for `libstack.itamih.com` · GitHub Action chain (vault push → `rebuild-libstack.yml` → site deploy) · iPhone PWA offline-verified · KaTeX shipped for math-heavy articles.

### Phase 2 v2 — Vault round-trip (closed 2026-05-18, UX polish 2026-05-20)

Goal: phone-side reading work writes back to the vault via a Cloudflare Worker, scoped to bounded write types with shared-secret auth and an audit trail. Full spec in `PLAN-vault-bridge.md`.

**Worker + PWA (2026-05-18):**
- [x] CF Worker `vault-bridge` — `/api/notes` + `/api/mark-read` · shared-secret auth · GitHub API commits via plain `fetch` · URL normalization for mark-read matching · CORS
- [x] PWA UI — notes textarea (5s autosave, IndexedDB write-queue with reconnect retry), mark-read button, Settings for shared-secret entry
- [x] `.github/workflows/deploy-worker.yml` — push to `workers/vault-bridge/**` → `bunx wrangler deploy`
- [x] Autodeploy chain — LibStack push → vault `rebuild-libstack.yml` → site deploy (verified)
- [x] Hygiene invariant — scoped contracts, source-tagged (`Source: libstack`), auditable; vault stays SoT

**UX polish pass (2026-05-20):**
- [x] localStorage overlay so mark-read reflects instantly on cluster index (`ddd8947`)
- [x] Read-row resting state — ✓ chip, strikethrough title, dropped literal "· read" text
- [x] Notes UX rebuilt — bottom-right pill + 85vh bottom sheet with existing vault notes rendered inline; auto-expanding textarea; visible save-status (`018fad2`)
- [x] Existing-notes build wiring — `scripts/build-content.ts` reads `$VAULT/inbox/raw/captures/notes/<slug>.md` and renders a minimal markdown subset to HTML at build time
- [x] Home page — collapsible clusters w/ per-cluster localStorage persistence + Resume/Up next surface (`82abb2c`)

**Dropped from v1, deferred to v1.1:** highlights (iOS Safari selection UX needed design — see Active below).

---

## Active

### Phase 2 v2.1 — Highlights + polish closeout

Goal: ship the third vault write type, finish the polish list, validate the redesigned mobile experience.

- [ ] **Mobile formatting polish** (flagged 2026-05-20 via screenshots):
  - Long article titles overflow on iPhone (`<h1>` in article page has no `break-words`)
  - Code blocks and KaTeX equations already have `overflow-x: auto` but no scroll affordance — users can't tell they're swipeable. Faded right-edge or scroll-shadow would help.
  - Possibly smaller text or wrap-anywhere for very long single-token lines in code blocks
- [ ] **Kill notes → highlights + per-highlight annotation** *(DECIDED 2026-05-20)*. Remove the freeform notes feature; replace with highlights as primary primitive, each with an optional inline annotation. Per-highlight comments quote-with-context — exactly the shape `/compile` wants. Worker `/api/notes` endpoint stays during migration so in-flight queued notes flush; existing notes files in vault aren't deleted. See memory `project_libstack_notes_pivot.md`.
- [ ] **Highlights v1.1 (reshaped)** — now subsumes the migration above. Spike iOS Safari selection capture on a real phone first (`<Hl>` button on selection); decide vault contract in `PLAN-vault-bridge.md` (likely `inbox/raw/captures/highlights/<slug>.md` with structured entries: quote + optional comment + timestamp). Add `POST /api/highlights` reusing IndexedDB queue. Surface existing highlights in the reader (margin/footnote/sheet — TBD). Repurpose the bottom-pill pattern: "Highlights (N)" instead of "Notes (N)."
- [ ] **Unmark-read** — flagged 2026-05-20. Needs new worker endpoint `/api/unmark-read` (unchecks `[x]` in the queue file) + UI button. Bigger than a localStorage toggle because it must round-trip to keep server state consistent. Pairs naturally with the highlights migration.
- [ ] **Listen-to-article** — new thread 2026-05-20. MVP: Web Speech API (`SpeechSynthesisUtterance`) — free, native iOS, no API key. Per-article "Listen" button alongside mark-read. Bigger version overlaps with NotebookLM thread (different scope, defer).
- [ ] **Sort / filter** — beyond mode pills: sort by added-recency or read-status; quick "unread only" toggle
- [ ] **Image localization** — cache article images locally so offline reading actually has images
- [ ] **Content-render polish** — Shiki for code, richer markdown rendering, type controls (font size, line height, theme)
- [ ] **Video tab** — surface video-embed articles as a separate view
- [ ] **OG tags** — proper per-article meta tags for link-preview correctness
- [ ] **Companion: nightly `/compile` cron in the knowledge vault** — distills captures into atomic notes; lives in vault, not here

### Phase 2 — Vault integration (bleeds into above; reshape as we go)

Goal: LibStack composes more deeply with vault data.

- [ ] **NotebookLM thread (expand)** — currently scoped as "audio link surfacing." Worth its own design pass: auto-generate NotebookLM notebooks per cluster, link audio inline with articles, surface in reader. Flagged for thinking, not built.
- [ ] **Reading-notes inline** — surface `research/reading-notes/<cluster>.md` entries beside each article in the cluster (separate from the per-article notes already loaded by Phase 2 v2)
- [ ] **Canon shelf** *(flagged 2026-05-31)* — render `research/_canon.md` as a first-class "Library/Canon" view, distinct from the reading *queue*. The queue is intake (to-read); canon is the durable, read-and-absorbed shelf worth re-citing. Parser reads the `## section` → `- [title](url) — when-to-reach-for-it` shape (same grammar as the queue). Surfaces the "sources in" half of the durable layer; pairs conceptually with `writing/` (synthesis out). Reuses the existing Readability cache so canon articles are offline-readable too.
- [ ] **Reading progress (commit-as-state)** — promote the localStorage MVP (`read-state.ts`, `nav-state.ts`) to commit-backed state once it's clear what's worth persisting beyond the device

**Dropped:**
- ~~`[[wikilinks]]` resolution~~ — Obsidian already does this; out of scope
- ~~Search~~ — shipped (`src/components/Search.tsx` + Fuse)
- ~~Reading progress (localStorage MVP)~~ — shipped 2026-05-20

---

## Phase 3 — Compounding edges (opportunistic, not committed)

Speculative live-render features. Listed so they don't get forgotten; no commitment to building any.

- [ ] **"This Week" surface** — read-only home view loading `daily/W##.md` (lint-generated todos + ≤3 active reads + 1 compile target). Phone-first.
- [ ] **AI summary per article** — Claude API, cached at build time
- [ ] **Cross-article wikigraph** — citation graph rendering
- [ ] **Reading streaks / cadence visualization**
- [ ] **Multi-vault support** — only if work/personal ever split

**Moved out of LibStack's roadmap:** the Mac mini / iMessage-capture / Hermes / OpenClaw threads. LibStack is the *render surface*; the capture pipeline (iMessage → ambient agent → vault `inbox/reading-queue.md`) is vault infrastructure and belongs in the vault's own dashboard. LibStack passively picks up new queue entries through its existing parser — zero LibStack code involved.

---

## Out of scope

- **Authentication** — vault is private; LibStack render is public. If something is sensitive, it doesn't go in `inbox/reading-queue.md`.
- **Comments / social** — not the point.
- **Re-implementing Obsidian** — LibStack is reading + light annotation; structural editing happens in Obsidian or directly in the vault repo.
- **Productization** — parked thread. Stay single-user until/unless explicitly revisited.
