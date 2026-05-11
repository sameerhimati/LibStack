# Session Handoff

> Persistent context between Claude Code sessions. Read at start (`/session-kickoff`), update at end (`/session-handoff`).

---

## Last updated: 2026-05-11 (vault-bridge spec refined, build deferred to next session)

### What just happened — recent arc

Mid-vacation pickup. Two parallel CC sessions coordinated on a substantial Phase 2 v2 expansion:

**This session — vault-bridge spec refinement (`f9e67a8`):**
- Walked through 8 architectural decisions on `PLAN-vault-bridge.md` (originally drafted in `c167285` from a prior session)
- All 8 resolved interactively; plan file at `~/.claude/plans/eventual-inventing-cherny.md`
- PLAN, ROADMAP, and the load-bearing invariant in this handoff all updated to match the refined scope
- **Net change vs. original spec:** v1 ships **notes + mark-read only**, highlights deferred to v1.1, IndexedDB write queue + IndexedDB secret storage, URL normalization for mark-read, capture dir renamed from brand-coupled `libstack-captures/` to generic `captures/`

**Concurrent vault-rooted session — mode tags + reorg (`d4e5722` LibStack, `0a05e16` knowledge):**
- Added `[Q]/[A]/[H]` mode tag prefixes to `inbox/reading-queue.md` entries (Quick X thread <10min / Article 20-40min / Heavy paper 1-2hr+)
- LibStack parser updated to extract `Mode`, new `ModeBadge` + `ClusterSection` components, per-cluster filter row (only renders for modes actually present)
- Worked sample applied to "BUILD: Agent Memory & Personalization" cluster (6×Q, 2×A); full reorg plan staged as HTML comment at the top of `reading-queue.md`, applies W20 during `/lint`
- That session also redesigned Section B (`/compile` companion) from launchd-fire-forget to iMessage-interactive (nightly cron pings phone with "3 ready, reply Y/skip/title", reply gates each distill) — research thread, not built yet

### Current live state

- `reading.itamih.com` — 129 queue entries, 19 fetched with full content, 13 KaTeX-rendered articles, mode-tag badges + cluster filters live after next vault push (or run `gh workflow run rebuild-libstack.yml --repo sameerhimati/knowledge` to deploy now)
- Auto-deploy: any push to `inbox/reading-queue.md` on main in `sameerhimati/knowledge` → ~50s to live
- PWA installable on iPhone + iPad via Safari → Share → Add to Home Screen
- All commits pushed to origin on both repos

### Next session — build vault-bridge v1 worker

**Where:** **LibStack-rooted session** (`cd ~/Desktop/Code/LibStack`). All worker code (`workers/vault-bridge/`), PWA changes (`src/app/article/[slug]/page.tsx`, `src/lib/`, `src/components/Settings.tsx`), and deploy workflow (`.github/workflows/deploy-worker.yml`) live in LibStack repo. The vault is only touched at runtime by the worker's commits — no build-time vault access needed.

**Specs to read first:**
1. `PLAN-vault-bridge.md` (in this repo) — the refined execution spec
2. `~/.claude/plans/eventual-inventing-cherny.md` — full decision log (A–H) with rationale, in case any decision needs revisiting

**Estimated effort:** 3–5 hours including iOS phone test pass. Build order is in PLAN-vault-bridge.md section "Build order."

**Manual setup before the build session can deploy:**
- CF Worker dashboard: create `vault-bridge` worker (or `wrangler init` handles it), set secrets `GITHUB_PAT` (vault repo, `contents:write` scope) + `SHARED_SECRET` (32-char random)

**Concurrent work to coordinate with:** the vault-rooted session is handling Section B (`/compile` iMessage redesign). Section A (this worker) is independent — it commits capture files to `inbox/raw/captures/notes/<slug>.md`; Section B reads those captures later. No build-time dependency.

### Resolved decisions (vault-bridge v1)

| ID | Decision |
|---|---|
| A | Per-article note files at `inbox/raw/captures/notes/<slug>.md`, 5s autosave overwrites whole file. Composes natively with `/compile` Mode A. |
| B | Generic `inbox/raw/captures/` dir (not brand-coupled). Each file includes `Source: libstack` header for provenance. |
| C | A and B (compile cron) split across sessions, no sequencing dependency. |
| D | Hygiene-based invariant (scoped contracts, source-tagged, auditable; vault stays SoT) — see below. |
| E | Mark-read URL normalization on both sides (strip trailing `/`, `www.`, `utm_*`, `fbclid`, `gclid`, `ref`); 404 on no match, 409 on multiple. |
| F | IndexedDB write queue + retry on reconnect — failed POSTs survive plane mode, flush on `online` event. |
| G | Highlights deferred to v1.1 (proper iOS Safari selection UX design time). |
| H | Shared secret stored in IndexedDB (more durable than localStorage on iOS). |

### Phase 2 v2 — broader scope (post-worker)

After vault-bridge v1 ships, the remaining Phase 2 v2 items in priority order:

1. **Highlights v1.1** (iOS-safe selection UX with copy-to-clipboard fallback if needed)
2. **Sort & filter** (domain, cluster, length, recency, read state, tier)
3. **Image localization** — download external `<img>` at build, rewrite to `out/article/<slug>/images/`. Closes the offline-image gap.
4. **Content render polish** — Shiki syntax highlighting, Markdown for direct .md links, PDF support
5. **Type controls** — font size, serif/sans, dark mode toggle
6. **Video** — YouTube detection + embed; dedicated Video tab with continuous queue
7. **OG meta tags** for share previews

Suggested but unconfirmed:
- Reading time estimates, reading progress (scroll position), keyboard shortcuts (j/k/r), per-cluster unread badges, "This week" view, export-as-markdown clipboard button

### Follow-ups (small, do whenever)

1. **Per-article progress logging in fetcher** — `build-content.ts` logs every 5 articles; flaky network looks frozen. Add `[i/N] fetching url…` lines + real disk cache in `content/cache/` (path created but unused).
2. **LibStack-side push-to-deploy workflow** — code changes deploy from local only. Add `.github/workflows/deploy.yml` on push to main; same secrets pattern.
3. **Real branded icons** — replace `public/icon-*.png` placeholders before any public sharing.
4. **Trim SW fallback for `/articles.json`** — runtime fetch handler never fires (content inlined at build); keep as documented intent or delete.

### Load-bearing invariant

LibStack writes to the vault are:
1. scoped to explicit contracts defined in `PLAN-vault-bridge.md` (or successor specs)
2. source-tagged in file headers (e.g., `Source: libstack`)
3. auditable — each write produces a single commit with a clear message

The vault git repo remains source-of-truth for all derived state. Adding new write types or new destinations requires a deliberate spec update, not silent expansion.

### Context for next-session Claude

- `reading.itamih.com` is live. CF account: `3665dc371e2496fd438127cf5a335e1c`, project `libstack`.
- Auto-deploy pipeline: push to `inbox/reading-queue.md` → knowledge repo workflow → `wrangler pages deploy` → ~50s to live.
- Three secrets in knowledge repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LIBSTACK_REPO_PAT`.
- LibStack repo code changes still deploy from local: `wrangler pages deploy out --project-name=libstack` (until follow-up #2 lands push-to-deploy).
- `content/cache/` is created but unused — the cache is `articles.json` itself.
- Knowledge repo path: `~/Desktop/knowledge/`. Reading queue: `inbox/reading-queue.md`. Cluster headers `## CLUSTER`, tier sub-headers `### Tier N`, entries `- [ ] [optional [Q]/[A]/[H]] [Title](url) — note`.
- Concurrent vault session is doing Section B (compile iMessage redesign) and ongoing `/lint` reorg work — keep concerns separated, don't double-edit `reading-queue.md`.

### Recent commit history

```
f9e67a8  docs: refine vault-bridge v1 scope — notes + mark-read, defer highlights   (this session)
d4e5722  feat: render [Q]/[A]/[H] mode tags from reading queue                       (concurrent session)
c167285  docs: vault-bridge plan + Phase 2 v2 / June exploration threads             (prior session)
07dff7f  docs: final session handoff — Phase 1 done, pipeline validated
6cde02f  docs: lock image localization + video tab + highlighting into Phase 2 v2
8bc7b90  docs: roll session handoff for end-of-Phase-1
734a87e  feat: render LaTeX math at build, fix pre overflow
4026074  feat: PWA + client-side search for Phase 1 readiness
a7d73fd  feat: offline bundle for trip + lock Phase 1/2 scope
16d75d4  scaffold: LibStack reading viewer for the knowledge vault
```
