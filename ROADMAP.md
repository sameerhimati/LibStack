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

## Phase 2 v2 — Vault round-trip (this week, 2026-05-10 → 2026-05-16, vacation async)

Goal: LibStack stops being read-only. Phone-side reading work (notes, mark-read) writes back to the vault via a Cloudflare Worker, scoped to two write types in v1. See `PLAN-vault-bridge.md` for the full execution spec.

- [ ] CF Worker `vault-bridge` (`workers/vault-bridge/`) — two endpoints: `/api/notes`, `/api/mark-read`. Shared-secret auth (stored in IndexedDB on the client), GitHub API commits to `sameerhimati/knowledge`. URL normalization for mark-read matching.
- [ ] PWA UI — notes textarea (5s autosave, IndexedDB write queue with retry on reconnect), mark-read button, Settings component for shared-secret entry.
- [ ] Highlights deferred to v1.1 (proper iOS Safari selection UX design).
- [ ] `.github/workflows/deploy-worker.yml` — push to `workers/vault-bridge/**` → `bunx wrangler deploy`.
- [ ] Update `session-handoff.md` invariant — hygiene-based (scoped contracts, source-tagged, auditable; vault stays SoT).
- [ ] Companion: nightly `/compile` cron in the knowledge vault distills captures into atomic notes (separate plan, redesigned as iMessage-interactive; lives in vault repo, not here).

Acceptance: open LibStack on phone, take a note + mark-read one article, see commits in vault repo within 5s. End-to-end loop: phone note (in flight, no network) → IndexedDB queue → WiFi reconnect → vault commit → next morning `/compile` distills.

**Explicit non-goals:** highlights in v1 (deferred), archive state, GBrain integration (rejected).

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

### Live render features
- [ ] **"This Week" surface** — read-only home view that loads `daily/W##.md` and surfaces the lint-generated todos + ≤3 active reads + 1 compile target. Phone-first.
- [ ] AI summary per article (Claude API, cached)
- [ ] Cross-article wikigraph (article A cites article B, render as graph)
- [ ] Reading streaks / cadence visualization
- [ ] Multi-vault support (if Sameer ever has separate work/personal vaults)

### June exploration threads (Mac mini ambient agent era)

Not LibStack code per se — LibStack is the render surface, an ambient agent on the Mac mini does the capture. Documented here so the loop is visible.

- [ ] **iMessage → reading-queue** — forward a link to a dedicated number/contact, ambient agent on Mac mini parses, commits to `inbox/reading-queue.md`. Existing rebuild workflow lights it up in LibStack within ~50s. Replaces the generic "paste a URL on phone" idea with a concrete pipeline. (Original generic item: paste a URL on phone, trigger fetch + commit to `inbox/reading-queue.md`.)
- [ ] **Hermes Agent exploration** — single-channel ambient runner for one repeatable task (TBD: maybe nightly `/compile`, maybe weekly reading triage). Skill-accumulation loop. Single use case to start, no skill marketplace, no third-party skills. Decision point in June.
- [ ] **OpenClaw on Mac mini** — gateway-first runtime, bound to loopback + Tailscale Serve. Single channel (iMessage) and single use case (capture-to-queue) to start. Defer all multi-channel/multi-skill work until after the single channel proves itself.

**Constraints (carry forward from research):** GBrain rejected. No third-party skills from ClawHub (12% malware rate). No `hermes claw cleanup` ever. No public exposure of the Gateway port — loopback + Tailscale only.

---

## Out of scope

- Authentication — vault is private but LibStack render is public. If something is sensitive, it doesn't go in `inbox/reading-queue.md`.
- Comments / social — not the point of this tool.
- Re-implementing Obsidian — LibStack is reading-only; editing happens in Obsidian or the vault directly.
