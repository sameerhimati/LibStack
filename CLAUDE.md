# LibStack — Claude Code Project Context

LibStack is a reading viewer for Sameer's knowledge vault. It reads `~/Desktop/knowledge/inbox/reading-queue.md`, fetches each unread article, extracts clean readable content via Mozilla Readability, and renders the whole thing as a static site. Source-of-truth stays in the vault; LibStack is a derived view.

End-state: `reading.itamih.com` — a PWA that scales as the reading-queue and vault grow. Replaces Obsidian Cloud for reading purposes.

## Why this exists

- The vault is git-committed; reading list lives there
- Obsidian's mobile experience is awful for long-form reading
- Third-party readers (Pocket/Readwise) are unowned and don't compose with the vault
- A static site backed by the vault git repo is owned, scales for free, and compounds with every reading-queue update
- Belongs to the **OS layer** of the AI-native compounder thesis (same family as the vault, skills, hooks, memory)

## Stack

- Next.js 14 App Router + static export (`output: "export"`)
- Tailwind CSS + `@tailwindcss/typography` for prose
- Bun for scripts and install
- `@mozilla/readability` + `jsdom` for content extraction

Per `~/.claude/CLAUDE.md` defaults: Next.js + Tailwind. Bun chosen for speed of script execution.

## Phases

See [ROADMAP.md](./ROADMAP.md) for full plan. Quick summary:

- **Phase 0 (now)** — trip bundle: parse queue, fetch articles, static export, AirDrop to iPad
- **Phase 1** — PWA + deploy to `reading.itamih.com`, GitHub Action rebuilds on vault push
- **Phase 2** — vault integration: reading-notes alongside articles, `[[wikilinks]]` resolution, search, highlights persisted as commits

## Common commands

```bash
bun run build:content      # parse queue + fetch articles into content/articles.json
bun run dev                # next dev server
bun run build              # build:content + next build → out/
bun run export:trip        # full pipeline + reminder to AirDrop
```

Set `VAULT_PATH` to override default `~/Desktop/knowledge`.

## Key files

- `scripts/build-content.ts` — parser + fetcher, the load-bearing script
- `src/lib/types.ts` — `Article`, `Cluster`, `Library` types
- `src/lib/articles.ts` — read library JSON
- `src/app/page.tsx` — cluster index
- `src/app/article/[slug]/page.tsx` — reader view (uses `generateStaticParams`)
- `content/articles.json` — generated, gitignored

## Conventions

- Don't commit `content/articles.json` — regenerate from vault
- X/Twitter URLs cannot be fetched (auth wall); they degrade to "open original"
- New cluster sections appear in `inbox/reading-queue.md` as `## CLUSTER:` — parser picks them up automatically
- Killed/archive sections in the queue are skipped by the parser

## Session workflow

Use [session-handoff.md](./session-handoff.md) at the end of each focused session to persist context. Read it at the start of the next session via `/session-kickoff`.
