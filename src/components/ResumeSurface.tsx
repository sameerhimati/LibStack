"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Article, Library } from "@/lib/types";
import { useLastOpened } from "@/lib/nav-state";
import { useLocalReadSet } from "@/lib/read-state";
import ModeBadge from "./ModeBadge";

type Props = {
  library: Library;
};

type ArticleWithCluster = Article & { clusterTitle: string };

export default function ResumeSurface({ library }: Props) {
  const lastOpened = useLastOpened();
  const localRead = useLocalReadSet();

  const all: ArticleWithCluster[] = useMemo(
    () =>
      library.clusters.flatMap((c) =>
        c.articles.map((a) => ({ ...a, clusterTitle: c.title })),
      ),
    [library],
  );

  const isRead = (a: { slug: string; read?: boolean }) =>
    Boolean(a.read) || localRead.has(a.slug);

  // Resume: last-opened, still unread, still has content.
  const resume = useMemo<ArticleWithCluster | null>(() => {
    if (!lastOpened) return null;
    const hit = all.find((a) => a.slug === lastOpened.slug);
    if (!hit || isRead(hit) || !hit.content) return null;
    return hit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, lastOpened, localRead]);

  // Up next: up to 3 readable unread articles, biased toward resume's cluster.
  const upNext = useMemo<ArticleWithCluster[]>(() => {
    const readable = all.filter((a) => !isRead(a) && a.content);
    if (readable.length === 0) return [];

    const exclude = new Set<string>();
    if (resume) exclude.add(resume.slug);

    const picks: ArticleWithCluster[] = [];
    if (resume) {
      for (const a of readable) {
        if (picks.length >= 3) break;
        if (exclude.has(a.slug)) continue;
        if (a.clusterTitle === resume.clusterTitle) {
          picks.push(a);
          exclude.add(a.slug);
        }
      }
    }
    for (const a of readable) {
      if (picks.length >= 3) break;
      if (exclude.has(a.slug)) continue;
      picks.push(a);
      exclude.add(a.slug);
    }
    return picks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, resume, localRead]);

  if (!resume && upNext.length === 0) return null;

  return (
    <section className="space-y-4 rounded-md border border-black/10 dark:border-white/10 p-4">
      {resume && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted">Resume reading</p>
          <div className="flex items-baseline gap-3">
            <ModeBadge mode={resume.mode} />
            <Link
              href={`/article/${resume.slug}/`}
              className="font-medium text-accent hover:underline"
            >
              {resume.title}
            </Link>
          </div>
          <p className="text-xs text-muted">
            {resume.clusterTitle} · {resume.domain}
          </p>
          {resume.description && (
            <p className="text-sm text-muted line-clamp-2">{resume.description}</p>
          )}
        </div>
      )}

      {upNext.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted">Up next</p>
          <ul className="divide-y divide-black/5 dark:divide-white/5 border-y border-black/5 dark:border-white/5">
            {upNext.map((a) => (
              <li key={a.slug} className="py-2">
                <div className="flex items-baseline gap-3">
                  <ModeBadge mode={a.mode} />
                  <Link
                    href={`/article/${a.slug}/`}
                    className="font-medium hover:text-accent"
                  >
                    {a.title}
                  </Link>
                  <span className="text-xs text-muted shrink-0">{a.domain}</span>
                </div>
                <p className="text-xs text-muted mt-0.5">{a.clusterTitle}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
