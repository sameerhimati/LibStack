# Session Handoff

> Persistent context between Claude Code sessions. Read at start (`/session-kickoff`), update at end (`/session-handoff`).

---

## Last updated: 2026-05-08 (pre-trip — scope lock + offline bundle)

### What just happened

- Project scaffolded at `~/Desktop/Code/LibStack`; first commit `16d75d4` landed
- Stack: Next.js 14 App Router + Tailwind + Bun + `@mozilla/readability`
- Static export configured (`next.config.mjs: output: "export"`, `trailingSlash: true`)
- First end-to-end build green: 122 entries, 13 fetched, 109 X degrades to "open original"
- **Caught:** Next export uses absolute paths (`/_next/...`, `/article/foo/`) — broken under `file://` on iPad. Built `scripts/build-offline-bundle.ts` to produce `out-offline/` with rewritten relative paths + `index.html` appended to internal directory links. Tested: 199 rewrites across 16 HTML files, paths look correct.
- **Scope locked** for Phase 1 and Phase 2 (see below). LibStack is OS-layer infrastructure for reading the vault; not a capture platform. Defaults to simple.

### Current state

- [x] First end-to-end build succeeded
- [x] Initial git commit done (`16d75d4`)
- [x] Offline bundle script working (`bun run build:offline` after `bun run build`, or `bun run export:trip` for full pipeline)
- [ ] iPad AirDrop test of `out-offline/` (verify offline in Safari before trip)

### Tweaks made during scaffold

- `next.config.ts` → `next.config.mjs` (Next 14.2 doesn't support TS config yet)
- Removed `bun-types` from tsconfig (Next type-check pulled it; unused in app code)
- Added `build:offline` script and `out-offline/` to `.gitignore`

### Phase 1 — locked (post-trip, 2026-05-17 → 2026-05-22)

1. ~~`scripts/build-offline-bundle.ts`~~ — done pre-trip (above)
2. PWA manifest + service worker (offline-first)
3. Cloudflare Pages deploy at `reading.itamih.com` (DNS pending)
4. GitHub Action in the **knowledge repo**: push to `inbox/reading-queue.md` → rebuild LibStack → CF Pages deploy hook
5. Client-side search via fuse.js over titles + first paragraph

### Phase 2 — June+ (no-build sprint OS-layer work)

- Browser extension for capture (X, paywalls, SPAs uniformly — the right answer to the X problem)
- Reading-notes inline + `[[wikilinks]]` resolution
- Highlights with vault round-trip (architected properly, not localStorage stub)
- Content adapters (only when a second content type is real — PDF or YouTube)
- KaTeX, code rendering, OG meta, type controls (font size, serif/sans, dark mode toggle)

### Decisions

- **Deploy target: Cloudflare Pages** (2026-05-08). Static export fits, free tier, deploy hooks compose with vault-side GH Action.
- **Defer X capture.** Vault was migrated off iCloud months ago — Shortcut→iCloud is not a path. Browser extension is the right answer, but Phase 2. Until then, X URLs degrade to "open original" (most are threads readable in the X app on signal anyway).
- **No content-adapters refactor.** YAGNI; one happy path doesn't need abstraction. Refactor when a second type ingests for real.
- **No half-built highlights.** Skip the UI entirely until Phase 2 round-trip is architected.

### Blockers / open questions

- **DNS** — `itamih.com` zone control? Confirm before Phase 1 day 1.
- **iPad test pre-trip** — AirDrop `out-offline/` to iPad, open `index.html` from Files.app, verify styled + nav works offline.

### Load-bearing invariant

LibStack is a **derived view, never writes back to the vault.** Every Phase 2 proposal (extension, highlights round-trip, reading-notes) must respect this. The browser extension pushes captures into the vault git repo via a deliberate path; LibStack itself stays read-only.

### Context for next-session Claude

- Source of truth: `~/Desktop/knowledge/inbox/reading-queue.md`
- LibStack is **derived** — never write back to the vault from LibStack code
- Owned-OS doctrine: this belongs to the same family as the vault, skills, hooks, memory. Treat as compounder infrastructure, not side project.
- Per `~/.claude/CLAUDE.md`, X bookmarks live in vault. Reading-queue clusters group them by topic.
- Trip context: Sameer is on a road trip 2026-05-09 → 2026-05-16, then SF move on 2026-05-15 (overlap). LibStack Phase 1 starts on return.
