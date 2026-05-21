# Session Handoff
> Last updated: 2026-05-20 — mobile UX polish session: 4 feature commits + 1 regression fix + roadmap refresh. Live and phone-validated. Real-device feedback opened two new threads for next session (notes-vs-highlights pivot, listen feature) plus mobile-formatting polish.

## TL;DR
Pivoted off the planned Highlights v1.1 spike to fix UX things bothering Sameer on the live phone: mark-read had no immediate feedback, read articles looked "broken" rather than "done," sticky 120px notes bar ate the article, home page was a wall of clusters. Shipped four UX changes in three commits, refreshed the stale ROADMAP.md, then phone-validated and caught a regression (read articles became unopenable) + an iOS quirk (textarea zoom-on-focus) — both fixed. Six commits this session, all pushed. Zero blockers.

Real-device use surfaced two new design threads (saved to memory): consider removing notes for highlights-only on phone, and a "Listen to article" feature (Web Speech API MVP). Plus mobile-formatting polish (title overflow, code/KaTeX scroll affordance).

## Completed This Session
- [x] **Mark-read overlay + dimming polish** (`ddd8947`) — `src/lib/read-state.ts` writes the slug to localStorage on click; `ClusterSection` unions the local set with server `a.read` so the article visibly moves and dims the moment you bounce back from the article page. ✓ chip replaces mode badge on read rows.
- [x] **Notes UX — bottom pill + sheet** (`018fad2`) — full ArticleActions rewrite. Replaced sticky-top textarea with a fixed bottom-right "Notes" pill that opens an 85vh bottom sheet (existing vault notes as prose + auto-expanding textarea + visible save-status + secondary mark-read). Mark-read also moved above the title as a quiet outline button.
- [x] **Existing-notes build wiring** (in `018fad2`) — `scripts/build-content.ts` reads `$VAULT/inbox/raw/captures/notes/<slug>.md` and renders a minimal markdown subset to HTML at build time. Zero new client deps. Guarded by `existsSync`.
- [x] **Home org — collapsible clusters + Resume/Up next** (`82abb2c`) — cluster headers are now full-width buttons that toggle collapse (per-cluster localStorage, default expanded). New `ResumeSurface` above the cluster list inside `<Search>` so it hides during search.
- [x] **Roadmap refresh** (`ba8d1aa`) — closed Phase 0/1/2v2, pruned Phase 2 (dropped wikilinks; marked search + reading-progress shipped), removed the Mac mini ambient-agent section (belongs in vault dashboard), captured single-user stance explicitly.
- [x] **Post-validation regression + iOS fix** (`31f86f9`) — phone use surfaced two real bugs: (a) read articles with no in-app content (X tweets, paywall, etc.) became unopenable because I'd hidden "Open original ↗" on read rows; restored. (b) iOS Safari zoomed on textarea focus because font-size was 14px; bumped to 16px to suppress the zoom. Also dropped the strikethrough on read titles — it was making content articles look untappable even though the `<Link>` worked.
- [x] **Build script — read articles can now be readable in-app** (`<new>`) — diagnosed from Sameer's complaint that lilianweng/anthropic/steipete were dead ends. Root cause: `scripts/build-content.ts` filtered `toFetch` to unread articles only AND did cache hydration inside the worker loop, so read articles got neither a fresh fetch nor their previously-cached content carried forward. Restructured: cache hydrates onto every article upfront (regardless of read state); fetch any article still missing content (read state no longer gates). First post-fix build will retry the 3 non-X orphans (public sites, should fetch cleanly).

## Current State
- **Branch:** main · **HEAD:** `<new>` · clean, **all pushed**
- **Build:** green — `tsc` clean, `next build` 24 static pages, SW rebuilt
- **Live:** `reading.itamih.com` — autodeploy chain fires on each push
- **Blockers:** none

## Next Session Should
**Open with phone-validation of tonight's two fixes** before piling on. Specifically:
- Tap a read X/paywall row in the index — confirm "Open original ↗" reappears and works
- Tap a read content article — confirm it opens and there's no visual "this is closed" cue
- Tap the notes textarea on iPhone — confirm no viewport zoom on focus, keyboard opens cleanly

Then in priority order:

1. **Mobile formatting polish** (Sameer flagged via screenshots 2026-05-20):
   - **Long titles overflow** — h1 in `src/app/article/[slug]/page.tsx` has no `break-words`/`overflow-wrap`; titles like "while my_mcmc: gently(samples) - MCMC sampling for dummies" run off the right edge on iPhone
   - **Code blocks and KaTeX equations** — already have `overflow-x: auto` in `globals.css`, but no visual affordance that they're scrollable. Consider a faded right-edge gradient or scroll-shadow so users know to swipe
   - **Possible additions:** smaller `text-base` for `<pre>` on mobile (more fits per line), or wrap-anywhere for very long single-token lines

2. **Kill notes → highlights + per-highlight annotation** *(DECIDED 2026-05-20 evening)*. Sameer's framing: "kinda like annotating a file" — not one continuous note, but per-highlight comments that quote-with-context. This subsumes both Highlights v1.1 and the notes-vs-highlights pivot into one piece of work. Sequence: spike iOS Safari selection on a real phone first, decide vault contract in `PLAN-vault-bridge.md` (likely `inbox/raw/captures/highlights/<slug>.md` with structured `quote + optional comment + timestamp` entries), add `POST /api/highlights` reusing IndexedDB queue, surface existing highlights inline in the reader, repurpose the bottom-pill ("Highlights (N)"). Worker `/api/notes` stays during migration so in-flight notes flush; existing notes files in the vault aren't deleted. See memory `project_libstack_notes_pivot.md`.

3. **Unmark-read** — pairs with the highlights migration. Sameer: "i should be able to unmark read." Needs new worker endpoint `/api/unmark-read` (unchecks `[x]` in queue file) + UI button. Real two-way state, not just localStorage toggle.

4. **Listen-to-article feature.** MVP path: Web Speech API (`SpeechSynthesisUtterance`) — free, native iOS, no API key, decent voices. Per-article "Listen" button next to mark-read. Bigger version overlaps with NotebookLM thread (auto-podcasts per cluster) — defer.

5. Remaining roadmap polish (sort/filter, image localization, content-render polish, type controls, video tab, OG tags) — lower priority.

## Context to Remember
- **iOS Safari rule:** any text input with `font-size < 16px` triggers viewport zoom on focus. Tailwind's `text-sm` is 14px and will zoom. Use `text-base` (16px) or inline `style={{ fontSize: 16 }}` on any input/textarea the user types into. This bit us tonight — easy to hit again.
- **Notes file path is still unverified.** Build script reads `$VAULT/inbox/raw/captures/notes/<slug>.md`. Local notes dir doesn't exist yet (0 round-tripped). Confirm against `workers/vault-bridge/src/index.ts` write path the first time a real note round-trips.
- **Notes markdown renderer is intentionally minimal** (~80 LOC inline in `scripts/build-content.ts`). Tables, fenced code, task lists fall through as escaped text. Swap to `marked` if the rendered notes hit prose complexity.
- **Mark-read button now lives in two places** — above the title (primary) and in the sheet footer (secondary, after writing a note). Could drop one if it feels redundant.
- **Header counts on home page stay server-rendered.** Off by one until the rebuild lands; acceptable because cluster-level counts react via the localStorage overlay.
- **Two state files:** `src/lib/read-state.ts` (read-state overlay) and `src/lib/nav-state.ts` (last-opened + cluster collapse). Same custom-event + `storage` + `pageshow` pattern. If a third kind of client state appears, consider unifying.
- **Open threads (in memory):** UX audit deferred (Sameer flagged "we should think about running a UX audit at some point but not yet"); LibStack-as-product/vault-adjacent-pattern (post-MVP dream session); notes-vs-highlights pivot + listen feature (this session's phone-validation surfaces); X / unified-content-source (parked).
- **iCloud gotcha (still real).** Wrap git ops in retry loops. Build hit `ENOTEMPTY` on `out/` once tonight; second attempt clean. Don't re-diagnose.

## Start Command
`cd /Users/sameer/Desktop/Code/LibStack` — open `reading.itamih.com` on phone, run the validation checks above, then tackle mobile formatting polish (#1) or start the notes-vs-highlights design conversation (#2). Highlights v1.1 (#4) is queued but probably wants the pivot decision first.
