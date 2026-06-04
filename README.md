# LibStack

Reading viewer for the knowledge vault. Reads `inbox/reading-queue.md`, fetches articles, renders them as a static site you can take offline.

## Quickstart

```bash
bun install
bun run build         # parse queue + fetch articles + next build
open out/index.html   # works fully offline
```

For a road trip: AirDrop the `out/` folder to your iPad, open `out/index.html` in Safari. All readable articles are inlined.

## Phases

**Phase 0 (now) — trip bundle**
- Parse `inbox/reading-queue.md` into clusters + articles
- Fetch each unread URL via Mozilla Readability
- Static export to `out/`
- X/Twitter links degrade gracefully to "open original" (auth required)

**Phase 1 — deploy as PWA**
- Service worker for offline web caching
- Deploy to `libstack.itamih.com` (canonical). Note: `reading.itamih.com` and `libstack.pages.dev` are aliases of the same Cloudflare Pages project (`libstack`) and redirect to the canonical origin — keep settings/read-state on one origin.
- GitHub Action: rebuild on knowledge-vault push

**Phase 2 — vault integration**
- Show `research/reading-notes/` entries alongside articles
- Resolve `[[wikilinks]]` to vault notes
- Search across articles + vault
- Persist reading progress + highlights as commits to vault

## Configuration

`VAULT_PATH` env var (defaults to `~/Desktop/knowledge`).

## Structure

```
scripts/build-content.ts   # parse queue + fetch + extract
content/articles.json      # generated, gitignored
src/app/page.tsx           # cluster list
src/app/article/[slug]/    # reader view
```
