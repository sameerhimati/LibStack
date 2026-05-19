"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Cluster, Mode } from "@/lib/types";
import ModeBadge from "./ModeBadge";

type Filter = "all" | Mode;

const MODE_ORDER: Mode[] = ["Q", "A", "H"];

export default function ClusterSection({ cluster }: { cluster: Cluster }) {
  // Unread first, then read (kept visible but dimmed — see below).
  const ordered = useMemo(() => {
    const unread = cluster.articles.filter((a) => !a.read);
    const read = cluster.articles.filter((a) => a.read);
    return [...unread, ...read];
  }, [cluster.articles]);

  const presentModes = useMemo(() => {
    const set = new Set<Mode>();
    for (const a of cluster.articles) if (a.mode) set.add(a.mode);
    return MODE_ORDER.filter((m) => set.has(m));
  }, [cluster.articles]);

  const [filter, setFilter] = useState<Filter>("all");
  const filtered = filter === "all" ? ordered : ordered.filter((a) => a.mode === filter);

  if (cluster.articles.length === 0) return null;

  const unreadCount = cluster.articles.filter((a) => !a.read).length;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">{cluster.title}</h2>
        {cluster.description && (
          <p className="text-sm text-muted mt-1">{cluster.description}</p>
        )}
        <p className="text-xs text-muted mt-1">
          {unreadCount} unread · {cluster.articles.length} total
        </p>
        {presentModes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterButton>
            {presentModes.map((m) => (
              <FilterButton key={m} active={filter === m} onClick={() => setFilter(m)}>
                {m}
              </FilterButton>
            ))}
          </div>
        )}
      </div>
      <ul className="divide-y divide-black/5 dark:divide-white/5 border-y border-black/5 dark:border-white/5">
        {filtered.map((a) => (
          <li key={a.slug} className={"py-3 " + (a.read ? "opacity-45" : "")}>
            <div className="flex items-baseline gap-3">
              <ModeBadge mode={a.mode} />
              {a.content ? (
                <Link href={`/article/${a.slug}/`} className="font-medium hover:text-accent">
                  {a.title}
                </Link>
              ) : (
                <span className="font-medium">{a.title}</span>
              )}
              <span className="text-xs text-muted shrink-0">{a.domain}</span>
              {a.read && <span className="text-xs text-muted shrink-0">· read</span>}
              {!a.content && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto shrink-0 rounded border border-black/15 px-2 py-0.5 text-xs text-accent hover:bg-accent hover:text-paper dark:border-white/15"
                >
                  Open original ↗
                </a>
              )}
            </div>
            {a.description && (
              <p className="text-sm text-muted mt-1">{a.description}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded px-2 py-0.5 transition-colors " +
        (active
          ? "bg-accent text-paper"
          : "bg-black/5 text-muted hover:text-ink dark:bg-white/10 dark:hover:text-paper")
      }
    >
      {children}
    </button>
  );
}
