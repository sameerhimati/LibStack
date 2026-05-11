"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Cluster, Mode } from "@/lib/types";
import ModeBadge from "./ModeBadge";

type Filter = "all" | Mode;

const MODE_ORDER: Mode[] = ["Q", "A", "H"];

export default function ClusterSection({ cluster }: { cluster: Cluster }) {
  const unread = useMemo(
    () => cluster.articles.filter((a) => !a.read),
    [cluster.articles]
  );

  const presentModes = useMemo(() => {
    const set = new Set<Mode>();
    for (const a of unread) if (a.mode) set.add(a.mode);
    return MODE_ORDER.filter((m) => set.has(m));
  }, [unread]);

  const [filter, setFilter] = useState<Filter>("all");
  const filtered = filter === "all" ? unread : unread.filter((a) => a.mode === filter);

  if (unread.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">{cluster.title}</h2>
        {cluster.description && (
          <p className="text-sm text-muted mt-1">{cluster.description}</p>
        )}
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
          <li key={a.slug} className="py-3">
            <div className="flex items-baseline gap-3">
              <ModeBadge mode={a.mode} />
              <Link
                href={a.content ? `/article/${a.slug}/` : a.url}
                className="font-medium hover:text-accent"
              >
                {a.title}
              </Link>
              <span className="text-xs text-muted shrink-0">{a.domain}</span>
              {!a.content && (
                <span className="text-xs text-amber-600 shrink-0">external</span>
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
          ? "bg-foreground text-background"
          : "bg-black/5 text-muted hover:text-foreground dark:bg-white/10")
      }
    >
      {children}
    </button>
  );
}
