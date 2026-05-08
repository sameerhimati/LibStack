"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Fuse from "fuse.js";

export type SearchEntry = {
  slug: string;
  title: string;
  cluster: string;
  domain: string;
  url: string;
  snippet: string;
  hasContent: boolean;
};

type FuseModule = typeof import("fuse.js");

type Props = {
  children: React.ReactNode;
};

export default function Search({ children }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fuseRef = useRef<Fuse<SearchEntry> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const ensureIndex = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const [{ default: FuseCtor }, res] = (await Promise.all([
        import("fuse.js"),
        fetch("/search-index.json"),
      ])) as [FuseModule, Response];
      const entries: SearchEntry[] = await res.json();
      fuseRef.current = new FuseCtor(entries, {
        includeScore: true,
        threshold: 0.35,
        ignoreLocation: true,
        keys: [
          { name: "title", weight: 0.6 },
          { name: "snippet", weight: 0.3 },
          { name: "domain", weight: 0.1 },
        ],
      });
      setLoaded(true);
    } catch (e) {
      console.error("Failed to load search index", e);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  // Re-run search when query or index changes.
  useEffect(() => {
    if (!fuseRef.current || !query.trim()) {
      setResults([]);
      return;
    }
    const hits = fuseRef.current.search(query.trim()).map((h) => h.item);
    setResults(hits);
  }, [query, loaded]);

  // Keyboard: "/" focuses input, Esc clears + blurs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showingResults = query.trim().length > 0;

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={ensureIndex}
          placeholder="Search reading list…  (press / )"
          aria-label="Search reading list"
          className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {showingResults ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            {loading && !loaded
              ? "Loading search index…"
              : `${results.length} result${results.length === 1 ? "" : "s"} for “${query.trim()}”`}
          </p>
          {results.length > 0 && (
            <ul className="divide-y divide-black/5 dark:divide-white/5 border-y border-black/5 dark:border-white/5">
              {results.map((r) => {
                const href = r.hasContent ? `/article/${r.slug}/` : r.url;
                const external = !r.hasContent;
                return (
                  <li key={r.slug} className="py-3">
                    <div className="flex items-baseline gap-3">
                      <a
                        href={href}
                        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="font-medium hover:text-accent"
                      >
                        {r.title}
                      </a>
                      <span className="text-xs text-muted shrink-0">{r.domain}</span>
                      {external && (
                        <span className="text-xs text-amber-600 shrink-0">external</span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-1">{r.cluster}</p>
                    {r.snippet && (
                      <p className="text-sm text-muted mt-1 line-clamp-2">{r.snippet}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        children
      )}
    </>
  );
}
