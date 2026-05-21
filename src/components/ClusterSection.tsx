"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Cluster, Mode } from "@/lib/types";
import ModeBadge from "./ModeBadge";
import { reconcileLocalReadSet, useLocalReadSet } from "@/lib/read-state";
import { useClusterCollapsed } from "@/lib/nav-state";

type Filter = "all" | Mode;

const MODE_ORDER: Mode[] = ["Q", "A", "H"];

export default function ClusterSection({ cluster }: { cluster: Cluster }) {
  const localRead = useLocalReadSet();
  const isRead = (a: { slug: string; read?: boolean }) =>
    Boolean(a.read) || localRead.has(a.slug);

  // Once the build sees an article as read, drop it from the local overlay so
  // the localStorage set stays bounded.
  useEffect(() => {
    const serverRead = cluster.articles.filter((a) => a.read).map((a) => a.slug);
    if (serverRead.length) reconcileLocalReadSet(serverRead);
  }, [cluster.articles]);

  // Unread first, then read (kept visible but dimmed).
  const ordered = useMemo(() => {
    const unread = cluster.articles.filter((a) => !isRead(a));
    const read = cluster.articles.filter((a) => isRead(a));
    return [...unread, ...read];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster.articles, localRead]);

  const presentModes = useMemo(() => {
    const set = new Set<Mode>();
    for (const a of cluster.articles) if (a.mode) set.add(a.mode);
    return MODE_ORDER.filter((m) => set.has(m));
  }, [cluster.articles]);

  const [filter, setFilter] = useState<Filter>("all");
  const filtered = filter === "all" ? ordered : ordered.filter((a) => a.mode === filter);

  const { collapsed, toggle } = useClusterCollapsed(cluster.title);

  if (cluster.articles.length === 0) return null;

  const unreadCount = cluster.articles.filter((a) => !isRead(a)).length;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={`cluster-${cluster.title.replace(/\s+/g, "-")}`}
        className="-mx-2 flex w-full items-start gap-3 rounded px-2 py-1 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold">{cluster.title}</h2>
          {cluster.description && !collapsed && (
            <p className="text-sm text-muted mt-1">{cluster.description}</p>
          )}
          <p className="text-xs text-muted mt-1">
            {unreadCount} unread · {cluster.articles.length} total
          </p>
        </div>
        <span
          aria-hidden
          className={
            "mt-1 shrink-0 text-muted transition-transform " +
            (collapsed ? "" : "rotate-90")
          }
        >
          ›
        </span>
      </button>
      {!collapsed && presentModes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
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
      {!collapsed && (
      <ul
        id={`cluster-${cluster.title.replace(/\s+/g, "-")}`}
        className="divide-y divide-black/5 dark:divide-white/5 border-y border-black/5 dark:border-white/5"
      >
        {filtered.map((a) => {
          const read = isRead(a);
          return (
            <li key={a.slug} className={"py-3 " + (read ? "opacity-50" : "")}>
              <div className="flex items-baseline gap-3">
                {read ? (
                  <span
                    aria-label="read"
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center self-center rounded-full bg-accent/15 text-[10px] leading-none text-accent"
                  >
                    ✓
                  </span>
                ) : (
                  <ModeBadge mode={a.mode} />
                )}
                {a.content ? (
                  <Link
                    href={`/article/${a.slug}/`}
                    className="font-medium hover:text-accent"
                  >
                    {a.title}
                  </Link>
                ) : (
                  <span className="font-medium">{a.title}</span>
                )}
                <span className="text-xs text-muted shrink-0">{a.domain}</span>
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
              {a.description && !read && (
                <p className="text-sm text-muted mt-1">{a.description}</p>
              )}
            </li>
          );
        })}
      </ul>
      )}
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
