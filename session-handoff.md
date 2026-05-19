# Session Handoff
> Last updated: 2026-05-18 — vault-bridge v1 DONE (phone-validated in production); post-test UX batch shipped & live. Next: Highlights v1.1.

## TL;DR
LibStack now does the full phone→vault round-trip. v1 (notes + mark-read) is built, deployed, and **proven in production** (a real `libstack: mark read …` commit landed in the vault from Sameer's phone). A post-test UX batch is also live. The only loose end is a 3-min gated chore (`KNOWLEDGE_DISPATCH_PAT`) to make site deploys automatic. The next real feature is **Highlights v1.1**.

## Completed This Session
- [x] **vault-bridge v1** (`8bd5c98`): CF worker `/api/notes` + `/api/mark-read`, PWA libs/components, deploy workflow. Worker live at `https://vault-bridge.sameerhimati98.workers.dev`, both worker secrets set, CF token rotated.
- [x] **Phone test PASSED** — notes + mark-read confirmed end-to-end. Production proof: worker auto-committed a mark-read to the knowledge vault from the phone, which fired the rebuild. v1 is closed.
- [x] **Post-test UX batch** (`949eec5` ci, `88b68d4` feat) — deployed & verified live on `reading.itamih.com`:
  - Autodeploy `deploy.yml` (LibStack push → knowledge rebuild; gated on a PAT, see below)
  - Read articles persist + dim (`opacity-45`, after unread, "read" tag, per-cluster "X unread · Y total")
  - "Open original ↗" button for auth/paywall/X (no-content) articles
  - Notes box sticky + fixed-height (`h-20`) internally scrollable; mark-read+status in one compact bar
  - Fixed invisible cluster-filter active state (undefined tokens → `bg-accent`)

## Current State
- **Branch:** main · **HEAD:** `20ada3e` (docs handoff) · clean tree, all pushed
- **Build:** green (`tsc` clean, `next build` 24 pages)
- **Live:** `reading.itamih.com` (PWA + UX batch) and the worker — both deployed and verified
- **Blockers:** none

## GATED — Sameer, one 3-min chore (do first next session)
Makes site deploys automatic. Until done, `deploy.yml` fails on every LibStack push (expected/harmless — the worker still auto-deploys and `gh workflow run rebuild-libstack.yml --repo sameerhimati/knowledge` still deploys the site manually).
1. GitHub → new **fine-grained PAT**: owner `sameerhimati`, only repo `knowledge`, Repository permissions → **Actions: Read and write** (nothing else).
2. `gh secret set KNOWLEDGE_DISPATCH_PAT --repo sameerhimati/LibStack` — paste at the local prompt, never in chat.
3. Confirm: trivial push → `gh run list --workflow=deploy.yml --repo sameerhimati/LibStack` green → knowledge rebuild fires.

## Next Session Should
1. **Clear the gated chore above** (`KNOWLEDGE_DISPATCH_PAT`, ~3 min) so all subsequent Highlights pushes auto-deploy and can be phone-tested without manual rebuilds.
2. **Opening gambit — Highlights v1.1.** This was deliberately deferred from v1 (Decision G in `~/.claude/plans/eventual-inventing-cherny.md`) because iOS Safari selection UX needs real design — so **spike before coding**:
   - Open `src/components/ArticleActions.tsx` + `workers/vault-bridge/src/index.ts`.
   - Decide the iOS selection-capture UX: iOS Safari's native callout menu fights custom `selectionchange` handling. Likely a floating "Highlight" button on `selectionchange` with a copy-to-clipboard fallback. Prototype the capture on a real iPhone early — this is the risky part, not the endpoint.
   - Define the vault write contract and record it in `PLAN-vault-bridge.md` *before* coding (e.g., append under a `## Highlights` section in the existing `inbox/raw/captures/notes/<slug>.md`, vs. a sibling file). Mirror the `/api/notes` endpoint shape + the IndexedDB write-queue path (`src/lib/vault-bridge.ts`, `write-queue.ts`) — that infra is already built and proven, reuse it.
3. After Highlights: remaining Phase 2 v2 in `ROADMAP.md` priority — sort/filter, image localization, content-render polish, type controls, video, OG tags.

## Context to Remember
- **iCloud gotcha (cost ~45 min this session).** `~/Desktop/Code/LibStack` is under iCloud-synced Desktop; CloudDocs intercepts `.git` ops → `git commit` fails `'COMMIT_EDITMSG': Operation canceled`, reads/`git status` hang, `next build`/`mv .next` can wedge for tens of minutes. **Workaround:** wrap git ops in a retry loop (`for i in 1 2 3 4 5; do <cmd> && break; sleep 2; done`) — succeeds attempt 1–2. If git/FS hangs, it's iCloud — don't re-diagnose. **The move off iCloud was considered and DECLINED** (too risky with many active projects) — do not re-propose. (Also in auto-memory.)
- **Deploy topology:** site is built+deployed only by the *knowledge* repo's `rebuild-libstack.yml` (needs the vault checked out for `build:content`). `deploy.yml` bridges LibStack→knowledge but is inert until `KNOWLEDGE_DISPATCH_PAT` exists. Worker has its own independent `deploy-worker.yml` (working). "Code pushed but not live" = site wasn't rebuilt.
- **Three secrets, easy to confuse:** `CLOUDFLARE_API_TOKEN` (LibStack repo, CI worker deploy) · `GITHUB_PAT` + `SHARED_SECRET` (on the *worker*, via CF dashboard; `SHARED_SECRET` must equal what's typed in PWA Settings) · `KNOWLEDGE_DISPATCH_PAT` (LibStack repo, for autodeploy — not yet set).
- **Two accepted spec deviations:** plain `fetch` not `@octokit/core`; CORS on the worker (allowlist `reading.itamih.com` + `localhost:3000`).
- **Load-bearing invariant:** LibStack vault writes are scoped to `PLAN-vault-bridge.md` contracts, source-tagged (`Source: libstack`), auditable (one commit each); vault git repo is source-of-truth. New write types (e.g. highlights) require a spec update, not silent expansion.
- **Concurrent vault session:** Section B (`/compile` iMessage redesign) in the knowledge vault — independent; reads `inbox/raw/captures/notes/<slug>.md`. Did not touch LibStack.
- Worker version at deploy: `ee9567db-66da-44b2-a3aa-7c7b9f1289e1`. CF account `3665dc371e2496fd438127cf5a335e1c` (in `wrangler.toml`).

## Start Command
`cd /Users/sameer/Desktop/Code/LibStack` — clear the PAT chore, then start the Highlights v1.1 spike. Worker debugging: `cd workers/vault-bridge && bunx wrangler tail`. Manual site deploy until autodeploy is live: `gh workflow run rebuild-libstack.yml --repo sameerhimati/knowledge`.
