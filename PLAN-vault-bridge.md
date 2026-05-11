# LibStack v1: Vault round-trip (vault-bridge worker)

> Self-contained execution spec for Section A of the broader plan at
> `~/.claude/plans/twinkly-singing-haven.md`. Sections B/C/D of that plan
> live in the knowledge vault and are not in scope for the LibStack repo.

---

## Context

LibStack is currently a derived view — read-only by invariant (see `session-handoff.md` line 78). This change breaks that invariant in three scoped ways so phone-side reading work stops dying:

1. **Notes** — free-form per-article notes captured on the phone, written to a per-day capture file in the vault for nightly `/compile`.
2. **Mark-read** — toggle the queue checkbox in `inbox/reading-queue.md` from the article view.
3. **Highlights** — text selections persisted as per-article sidecar files.

Built this week (vacation, async). v1 worker is ~100 lines.

**GBrain is explicitly out of scope.** Don't install it, don't wire it as MCP, don't use it as a memory backend. The full plan rejects it.

---

## Architecture

```
PWA (LibStack) ──POST──▶ CF Worker (vault-bridge)
                            │
                            ├─ auth: shared-secret in localStorage
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

- `workers/vault-bridge/src/index.ts` — single Worker, three endpoints (`POST /api/notes`, `POST /api/mark-read`, `POST /api/highlight`), shared-secret auth header, GitHub commits via `@octokit/core` (Cloudflare-Workers compatible).
- `workers/vault-bridge/wrangler.toml` — name `vault-bridge`, account `3665dc371e2496fd438127cf5a335e1c`, secrets injected from CF dashboard.
- `workers/vault-bridge/package.json` — minimal: `@octokit/core`, `wrangler` (devDep).
- `.github/workflows/deploy-worker.yml` — push to `workers/vault-bridge/**` on main → `bunx wrangler deploy`. Reuses existing `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets.
- `src/lib/vault-bridge.ts` — POST helpers, retry-on-409, shared-secret loader from localStorage, optimistic local state.
- `src/components/Settings.tsx` — small UI: shared-secret one-time entry + worker URL, stored in localStorage. Hidden behind a settings cog in the header.

## Files to modify

- `src/app/article/[slug]/page.tsx` — add three UI elements:
  - Notes textarea (autosave with 5s debounce after typing stops)
  - Mark-read button (toggles checkbox state, optimistic, POSTs in background)
  - Highlight-on-select handler (text selection → save button → POST)
- `ROADMAP.md` — under Phase 2 v2, add: "vault-bridge worker shipped — notes, mark-read, highlights write back to vault."
- `session-handoff.md` line 78 — replace the invariant with:
  > LibStack is a derived view, with three scoped write-backs to the vault: notes (append to per-day capture file), mark-read (queue checkbox toggle), highlights (per-article sidecar). All other state stays read-only.

---

## Vault write contracts

| Write | Vault location | Format |
|---|---|---|
| Note | `inbox/raw/libstack-captures/YYYY-MM-DD.md` (append) | `## <article title> — HH:MM`<br>`Source: <url>`<br><br>`<note body>`<br><br>`---` |
| Mark-read | `inbox/reading-queue.md` (in-place) | Find line matching URL, flip `[ ]` → `[x]` |
| Highlight | `inbox/raw/libstack-captures/highlights/<article-slug>.md` (append) | `## HH:MM`<br>`> <selection text>`<br>(blank line) |

---

## Concurrency

Sameer manually edits `inbox/reading-queue.md` during `/lint`. Worker writes use GitHub's optimistic concurrency: read file SHA, conditional commit (`If-Match`), retry on 409. Conflicts auto-resolve in <2 retries 99% of the time. Occasional `git pull` before manual commits — acceptable.

Notes and highlights write to separate per-day / per-article files — zero contention with manual edits.

---

## Auth

Shared secret generated at worker setup (32-char random). Entered once in PWA Settings, stored in localStorage. Worker rejects requests without exact match in `x-secret` header. Rotation: regenerate, update CF env, re-enter in PWA. Not perfect security; acceptable for a personal-use PWA over HTTPS.

GitHub PAT: separate, lives only in CF env (`GITHUB_PAT` secret), scope = `contents:write` on `sameerhimati/knowledge` repo only.

---

## Build order

1. Scaffold `workers/vault-bridge/` — `wrangler init`, set up `package.json`, write the dispatcher in `src/index.ts` (notes endpoint first).
2. Deploy to CF, set secrets in dashboard, verify with `curl`.
3. Add the other two endpoints (mark-read, highlight) to the worker, test each with `curl`.
4. Build the PWA UI — Settings component first (so you can store the secret), then notes textarea, then mark-read button, then highlights.
5. Test on actual phone (the whole point) before declaring done.
6. Update `ROADMAP.md` and `session-handoff.md`.
7. Commit + push (deploy-worker workflow fires).

Estimated ~3-4 hours if no surprises.

---

## Verification

- `curl -X POST <worker-url>/api/notes -H "x-secret: <secret>" -H "content-type: application/json" -d '{"title":"test","url":"https://example.com","body":"hello world"}'` → verify commit lands in `inbox/raw/libstack-captures/<today>.md` within 5s.
- Mark-read against a real queue entry → verify `inbox/reading-queue.md` line flips `[ ]` → `[x]` and the rebuild workflow fires on the knowledge repo.
- Highlight test — POST a fake selection, verify file appears in `inbox/raw/libstack-captures/highlights/`.
- Open LibStack on phone (`reading.itamih.com` PWA) → take a real note on a real article → return to laptop → see commit in `sameerhimati/knowledge`.
- Concurrency test: while a worker write is in flight, edit `inbox/reading-queue.md` locally and commit. Verify worker retries and converges.

---

## Out of scope (this PR)

- Archive / hide-from-feed state (overlaps mark-read, defer)
- Highlight rendering on subsequent reads (just persistence)
- Multi-vault support
- Any LLM call from inside the Worker — `/compile` runs separately via cron (Section B of the broader plan, lives in the knowledge vault)
- GBrain — explicitly rejected

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
│   ├── app/article/[slug]/page.tsx       (modify — add note/highlight/mark-read UI)
│   ├── lib/vault-bridge.ts               (new)
│   └── components/Settings.tsx           (new)
├── ROADMAP.md                            (modify — Phase 2 v2 entry)
└── session-handoff.md                    (modify — line 78 invariant)
```

CF dashboard (manual setup):
- Worker `vault-bridge`, secrets `GITHUB_PAT` (vault repo, `contents:write` scope) + `SHARED_SECRET` (32-char random).
