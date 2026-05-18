# Session Handoff

> Persistent context between Claude Code sessions. Read at start (`/session-kickoff`), update at end (`/session-handoff`).

---

## Last updated: 2026-05-18 (vault-bridge v1 code complete — deploy + phone test gated on manual CF setup)

### What just happened — recent arc

**This session — vault-bridge v1 build (LibStack-rooted, not yet committed):**
- Started with a ~50-min filesystem wedge: orphaned `mv .next` + `bunx next build` processes from a prior session's verify/build loop were stuck in interruptible-sleep, jamming all working-tree IO (`git status`, file reads hung; `.git/` reads worked). Killed pids 29763/32932/32976/33154/33157 (state S, not D — no reboot needed) with Sameer's go-ahead; FS recovered immediately. Not the concurrent vault session — those were LibStack-cwd build orphans.
- Built all of vault-bridge v1 per `PLAN-vault-bridge.md`:
  - `workers/vault-bridge/` (index.ts + wrangler.toml + package.json + tsconfig) — `/api/notes` + `/api/mark-read`, x-secret auth, URL normalization, optimistic-concurrency GitHub commits, CORS. Worker typechecks clean.
  - `src/lib/write-queue.ts` + `src/lib/vault-bridge.ts` — IndexedDB queue + settings store, send-or-queue, reconnect flush, 4xx-terminal/5xx-transient/401-recoverable classification.
  - `src/components/{Settings,SyncManager,ArticleActions}.tsx` + wired into `layout.tsx` and `article/[slug]/page.tsx`.
  - `.github/workflows/deploy-worker.yml` — first workflow in the LibStack repo.
- Verified: repo `tsc --noEmit` clean, `next build` green (24 static pages incl. 20 article pages; client components prerender-safe).
- **Two deliberate deviations from the spec (flagged for veto, not yet vetoed):** (1) plain `fetch` to GitHub Contents API instead of `@octokit/core`; (2) CORS added to the worker (cross-origin correctness, not in plan).
- **Not committed.** Working tree dirty: new `workers/`, `.github/`, `src/components/{ArticleActions,Settings,SyncManager}.tsx`, `src/lib/{vault-bridge,write-queue}.ts`; modified `layout.tsx`, `article/[slug]/page.tsx`, `ROADMAP.md`, this file. `workers/vault-bridge/bun.lock` committed-to-be (needed by `--frozen-lockfile` in CI); `node_modules` gitignored.

**Prior session — vault-bridge spec refinement (`f9e67a8`):** 8 architectural decisions resolved (table below). Decision log: `~/.claude/plans/eventual-inventing-cherny.md`.

**Concurrent vault-rooted session:** handling Section B (`/compile` iMessage redesign) in the knowledge vault. Independent of this worker — it reads `inbox/raw/captures/notes/<slug>.md` later. No build-time dependency. Did not touch LibStack (HEAD still `d9c59cf`).

### Current live state

- `reading.itamih.com` — live, last deployed from `d9c59cf` (vault-bridge code is local-only, not yet deployed).
- Auto-deploy: any push to `inbox/reading-queue.md` on main in `sameerhimati/knowledge` → ~50s to live (unchanged).
- PWA installable on iPhone + iPad via Safari → Share → Add to Home Screen.
- vault-bridge changes are **local, uncommitted, undeployed**.

### Next session — deploy vault-bridge v1 + iOS phone test

**Decide first:** accept or revert the two deviations (plain `fetch` vs octokit; CORS). Then commit (one feat commit) + push.

**Manual setup (only Sameer can do — gated):**
1. CF dashboard: create `vault-bridge` worker (or let `wrangler deploy` create it), set secrets `GITHUB_PAT` (fine-grained PAT, `contents:write` on `sameerhimati/knowledge` **only**) + `SHARED_SECRET` (32-char random).
2. Add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to the **LibStack** GitHub repo secrets (they currently exist only on the knowledge repo — the deploy-worker workflow needs them on LibStack).
3. Deploy: push (workflow fires) or `cd workers/vault-bridge && bunx wrangler deploy` locally.

**Then phone test** per PLAN-vault-bridge.md "Verification" → "PWA on phone": enter secret+worker URL in Settings, note autosave persists, mark-read flips queue + drops article in ~60s, airplane-mode queue flushes on reconnect, force-quit-mid-pending reopen flushes. curl smoke tests for happy/normalization/404/409 are in the same section.

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
