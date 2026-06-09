# LibStack v1: Vault round-trip (vault-bridge worker)

> Self-contained execution spec for Section A of the broader plan at
> `~/.claude/plans/twinkly-singing-haven.md`. Sections B/C/D of that plan
> live in the knowledge vault and are not in scope for the LibStack repo.
>
> **v1 scope refined 2026-05-11** per `~/.claude/plans/eventual-inventing-cherny.md`:
> two endpoints (notes + mark-read), highlights deferred to v1.1, IndexedDB for
> offline write queue + secret storage, URL normalization for mark-read.

---

## Context

LibStack is currently a derived view — read-only by invariant (see `session-handoff.md`). This change relaxes that invariant in two scoped ways so phone-side reading work stops dying:

1. **Notes** — free-form per-article notes captured on the phone, written to a per-article file in the vault for nightly `/compile`.
2. **Mark-read** — toggle the queue checkbox in `inbox/reading-queue.md` from the article view.

Highlights are explicitly **deferred to v1.1** (iOS Safari selection UX deserves real design time).

Built this week (vacation, async). v1 worker is ~120 lines (added URL normalization + write queue offsets the dropped endpoint).

**GBrain is explicitly out of scope.** Don't install it, don't wire it as MCP, don't use it as a memory backend. The full plan rejects it.

---

## Architecture

```
PWA (LibStack) ──POST──▶ CF Worker (vault-bridge)
                            │
                            ├─ auth: shared-secret in IndexedDB
                            ├─ pulls latest vault SHA, applies write, commits via GitHub API
                            ├─ retry on 409 (optimistic concurrency)
                            │
                            ▼
                    GitHub API (sameerhimati/knowledge, main)
                            │
                            ▼
              Existing rebuild-libstack.yml fires on
              changes to inbox/reading-queue.md (~50s to live)
```

---

## Files to create

- `workers/vault-bridge/src/index.ts` — single Worker, **two endpoints** (`POST /api/notes`, `POST /api/mark-read`), shared-secret auth header, GitHub commits via `@octokit/core` (Cloudflare-Workers compatible).
- `workers/vault-bridge/wrangler.toml` — name `vault-bridge`, account `3665dc371e2496fd438127cf5a335e1c`, secrets injected from CF dashboard.
- `workers/vault-bridge/package.json` — minimal: `@octokit/core`, `wrangler` (devDep).
- `.github/workflows/deploy-worker.yml` — push to `workers/vault-bridge/**` on main → `bunx wrangler deploy`. Reuses existing `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets.
- `src/lib/vault-bridge.ts` — POST helpers, retry-on-409, IndexedDB-backed shared-secret loader, optimistic local state.
- `src/lib/write-queue.ts` — IndexedDB-backed write queue (`pending_writes` + `failed_writes` stores), flush on `online` event and PWA open, sequential retry with exponential backoff on 5xx.
- `src/components/Settings.tsx` — small UI: shared-secret one-time entry + worker URL, stored in IndexedDB. Includes a "review failed writes" panel. Hidden behind a settings cog in the header.

## Files to modify

- `src/app/article/[slug]/page.tsx` — add **two** UI elements next to the existing `ModeBadge`:
  - Notes textarea (autosave with 5s debounce; on failed POST, write enqueues to IndexedDB and UI shows "pending sync")
  - Mark-read button (optimistic, POSTs in background; UI shows error on 404/409 from URL-match failure)
- `ROADMAP.md` — Phase 2 v2 section already refined for two-endpoint scope + highlights-deferred.
- `session-handoff.md` — invariant section already replaced with the hygiene-based phrasing (writes are scoped, source-tagged, auditable; vault is SoT).

---

## Vault write contracts

| Write | Vault location | Format |
|---|---|---|
| Note | `inbox/raw/captures/notes/<article-slug>.md` (**overwrite**) | `# <title>`<br>`Source: libstack`<br>`URL: <url>`<br>`Mode: <Q\|A\|H>` *(omit if absent)*<br>`Updated: <ISO timestamp>`<br><br>`<body>` |
| Mark-read | `inbox/reading-queue.md` (in-place) | Normalize-match URL → flip `[ ]` → `[x]` on the matched line |

*Highlights deferred to v1.1.*

---

## Concurrency

Sameer manually edits `inbox/reading-queue.md` during `/lint`. Worker writes use GitHub's optimistic concurrency: read file SHA, conditional commit (`If-Match`), retry on 409. Conflicts auto-resolve in <2 retries 99% of the time. Occasional `git pull` before manual commits — acceptable.

Notes write to per-article files in a brand-new dir (`inbox/raw/captures/notes/`) — zero contention with anything currently in the vault.

---

## URL matching (mark-read)

The worker normalizes URLs on both sides before matching:
- lowercase scheme
- strip leading `www.`
- strip trailing `/`
- strip query params: `utm_*`, `fbclid`, `gclid`, `ref`

Single match required. Returns:
- `200` + flip on exactly one match
- `404` with diagnostic on zero matches
- `409` with line numbers on multiple matches

PWA surfaces `404`/`409` as a user-visible failure (no silent no-op).

---

## Auth

Shared secret generated at worker setup (32-char random). Entered once in PWA Settings, **stored in IndexedDB** (more durable on iOS than localStorage — localStorage is evicted after ~7 days of PWA non-use). Worker rejects requests without exact match in `x-secret` header. Rotation: regenerate, update CF env, re-enter in PWA.

GitHub PAT: separate, lives only in CF env (`GITHUB_PAT` secret), scope = `contents:write` on `sameerhimati/knowledge` repo only.

---

## Offline behavior

PWA queues failed POSTs in IndexedDB (`libstack` DB, `pending_writes` store).
Each queue entry: `{ id, endpoint, payload, attempts, queuedAt }`.

Triggers for flush:
- browser `online` event
- next PWA open
- manual retry button in Settings

Flush is sequential (not concurrent) with exponential backoff on `5xx`.
After 5 failed attempts, entry moves to a `failed_writes` store and surfaces in Settings for manual review.

UI states on article page:
- online + worker OK: `synced`
- queue not empty: `pending sync (N)`
- permanently failed: `sync error — review in settings`

---

## Build order

1. Scaffold `workers/vault-bridge/` — `wrangler init`, set up `package.json`, write the dispatcher in `src/index.ts` (notes endpoint first, per-article upsert).
2. Deploy to CF, set secrets in dashboard, verify notes endpoint with `curl`.
3. Add mark-read endpoint with URL normalization. Test with `curl` (happy path, normalization smoke, no-match 404, multi-match 409).
4. Build the PWA — Settings component first (IndexedDB secret store), then notes textarea + write queue, then mark-read button. `ModeBadge` already lives next to the article h1 from `d4e5722`; preserve it.
5. Test on actual phone over LTE + WiFi + airplane mode. Verify queue flushes on reconnect.
6. Commit + push (deploy-worker workflow fires).

Estimated 3-5 hours including the iOS test pass.

---

## Verification

```bash
# Notes — happy path (per-article overwrite)
curl -X POST https://vault-bridge.<account>.workers.dev/api/notes \
  -H "x-secret: <secret>" \
  -H "content-type: application/json" \
  -d '{"slug":"mcmc-sampling","title":"MCMC sampling","url":"https://twiecki.io/blog/2015/11/10/mcmc-sampling/","body":"test note"}'
# → 200, commit in inbox/raw/captures/notes/mcmc-sampling.md visible in vault
# → re-POST overwrites the file in place (not appends)

# Mark-read — happy path
curl -X POST https://vault-bridge.<account>.workers.dev/api/mark-read \
  -H "x-secret: <secret>" \
  -H "content-type: application/json" \
  -d '{"url":"https://twiecki.io/blog/2015/11/10/mcmc-sampling/"}'
# → 200, line in inbox/reading-queue.md flips [ ] → [x]
# → rebuild-libstack.yml fires within seconds

# Mark-read — URL normalization smoke
curl ... -d '{"url":"https://www.twiecki.io/blog/2015/11/10/mcmc-sampling/?utm_source=test"}'
# → 200 (normalization strips www. and utm)

# Mark-read — no match
curl ... -d '{"url":"https://example.com/not-in-queue"}'
# → 404 with diagnostic body
```

**PWA on phone:**
- Open `libstack.itamih.com` PWA on phone → Settings → enter shared secret → reload, secret persists (IndexedDB)
- Type a note on an article, leave page after 6 seconds → return, note still there, commit visible in vault
- Tap mark-read on a queue article → article disappears from home view within ~60s (rebuild fires)
- Airplane mode + type note → 'pending sync' state shown, exit airplane mode → 'synced' within 10s
- Force-quit PWA mid-pending → reopen → queue flushes

**End-to-end loop:**
- Phone: note typed on article in flight (no network) → IndexedDB queue
- Landing: WiFi reconnects → queue flushes → commit in vault
- Next morning at desk: separate `/compile` session in vault picks up note as Mode A source → conversational distill → post draft → raw note deleted

---

## Out of scope (this PR)

- **Highlights** — explicitly deferred to v1.1 (proper iOS Safari selection UX design)
- **iOS native menu interaction tuning** — when v1.1 lands
- Archive / hide-from-feed state (overlaps mark-read, defer)
- Multi-vault support
- Any LLM call from inside the Worker — `/compile` runs separately (Section B of the broader plan, redesigned as iMessage-interactive; lives in the knowledge vault)
- GBrain — explicitly rejected

---

## v1.1 — Highlights + Unmark-read (2026-05-21)

v1 shipped two endpoints (notes, mark-read) on 2026-05-18 and ran in production for three days. Two extensions land in v1.1:

1. **Unmark-read** — `POST /api/unmark-read` (shipped 2026-05-21, commit `b79d59e`). Mirrors mark-read precisely with inverse toggle (`[x]` → `[ ]`); same auth, URL normalization, retry, response surface. Commit message in vault: `libstack: unmark read — <normalized-url>`.

2. **Highlights** — captures per-quote annotations from the phone into the vault. Replaces the freeform-notes primitive as the dominant capture surface; notes endpoint stays live during migration but the sheet UI is repurposed.

### Highlights — vault contract

| Write | Vault location | Semantics |
|---|---|---|
| Highlight | `inbox/notes/highlights/<article-slug>.md` | **Append-only** — read existing, append entry + separator, commit |

Per-entry format (markdown):

```
# Highlights — <title>
Source: libstack
URL: <url>

> Quoted text from the article. Multi-line quotes preserved.

Optional comment from Sameer.

<!-- libstack-highlight: 2026-05-21T12:34:56Z <clientId> -->
```

A `# Highlights — …` header tops a fresh file. Entries are joined by a `\n\n---\n\n` separator *between* them (no trailing `---`). The HTML comment carries the ISO timestamp and the capture clientId (per-entry identity for dedupe) without rendering in Obsidian. Edits to existing entries happen in Obsidian (out of phone scope).

### Highlights — endpoint

`POST /api/highlights` (vault-bridge worker)

- Request: `{ slug: string, title: string, url: string, mode?: string, quote: string, comment?: string }`
- Slug validated as `/^[a-z0-9-]+$/` (matches notes endpoint).
- Worker reads `inbox/notes/highlights/<slug>.md` via GitHub Contents API (or treats as empty if 404), appends the new entry, commits with `If-Match` SHA. 409 retry × 3.
- Commit message: `libstack: highlight — <first 40 chars of quote>…`
- Responses: `200 { ok: true, path }` on commit; `400` for missing fields or bad slug; `401` for bad secret; `409` for unrecoverable concurrency; `502` for upstream GitHub failure.

### Highlights — UI (PWA, sheet-only in phase 1)

- Bottom-right pill renames `Notes` → `Highlights (N)`. N comes from build-time parsing of the vault file (phase 2).
- Tap pill → sheet opens with:
  - `+ Add from selection` button at top — disabled if no text is currently selected in the article body. When enabled, shows a 60-char preview of the captured selection.
  - List of existing highlights below (phase 1: empty placeholder).
- Capture flow:
  - User long-presses inside `.prose` to select text.
  - A `selectionchange` listener captures the selected string + range into component state continuously.
  - User taps the pill. The captured selection is read from component state (not from `window.getSelection()` at tap time), so it survives the sheet open even if iOS clears the live selection.
  - Tap `+ Add from selection` → modal with quote (read-only) + comment textarea + Save/Cancel.
  - Save: POST `/api/highlights` via existing `sendOrQueue` path; queues offline as usual.
- The known iOS unknown: whether `selectionchange` fires reliably inside `.prose` and whether `window.getSelection().toString()` returns the long-pressed text. If `selectionchange` doesn't fire, fall back to `mouseup`/`touchend` polling. If selection text is empty at capture time, fall back to design B (tiny floating `+` button on selection) or design C (manual paste-in modal) — both pre-designed.

### Highlights — build-time parsing (phase 2)

`scripts/build-content.ts` mirrors the notes loader (lines 254–279) for the highlights file:
- `existsSync` guard on `$VAULT/inbox/notes/highlights/<slug>.md`.
- Split file on `---` separator lines.
- Per entry: collect lines starting `> ` as the quote; remaining paragraphs before the HTML comment as the comment; parse `<!-- libstack-highlight: ISO -->` for timestamp.
- Attach `highlights?: Array<{ quote: string; comment?: string; timestamp: string }>` to each Article.
- Reader sheet uses this to render the list. Existing minimal-markdown renderer (`renderNoteMarkdown` in build-content.ts:311) handles the comment paragraphs unchanged.

### Migration from notes

- `/api/notes` endpoint stays live in the worker — required to flush any in-flight IndexedDB queue entries from before the cutover.
- Existing notes files in the vault stay on disk (no delete).
- The PWA sheet drops the notes textarea and the "From the vault" notes rendering. Old notes are read in Obsidian.
- After ~1 week of no queued notes activity, the `/api/notes` endpoint can be removed in a follow-up.

### v1.1 scope discipline

- Phase 1 (this session, branch `feat/highlights-spike`): UI capture + IndexedDB queueing only. No worker endpoint yet; the queued payloads accumulate as a validation signal (inspectable via DevTools → Application → IndexedDB).
- Phase 2 (next session, branch `feat/highlights-roundtrip`): worker endpoint + build-script parsing + existing-highlights list rendering.
- No inline highlight marks in the article body for v1.1 — sheet-only surface.
- No edit/delete of existing highlights from the phone — fix typos in Obsidian. Reduces concurrency surface.
- No global highlights file (per-article only — mirrors notes pattern, matches build-script wiring).

---

## Critical files (quick reference)

```
LibStack/
├── workers/vault-bridge/
│   ├── src/index.ts                      (new)
│   ├── wrangler.toml                     (new)
│   └── package.json                      (new)
├── .github/workflows/deploy-worker.yml   (new)
├── src/
│   ├── app/article/[slug]/page.tsx       (modify — add notes + mark-read UI alongside ModeBadge)
│   ├── lib/vault-bridge.ts               (new)
│   ├── lib/write-queue.ts                (new — IndexedDB queue)
│   └── components/Settings.tsx           (new)
├── ROADMAP.md                            (modify — Phase 2 v2 entry)
└── session-handoff.md                    (modify — invariant)
```

CF dashboard (manual setup):
- Worker `vault-bridge`, secrets `GITHUB_PAT` (vault repo, `contents:write` scope) + `SHARED_SECRET` (32-char random).
