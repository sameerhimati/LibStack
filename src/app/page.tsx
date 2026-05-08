import Link from "next/link";
import { loadLibrary } from "@/lib/articles";
import Search from "@/components/Search";

export default function Home() {
  const lib = loadLibrary();
  const totalUnread = lib.clusters.reduce(
    (n, c) => n + c.articles.filter((a) => !a.read).length, 0
  );
  const totalAvailable = lib.clusters.reduce(
    (n, c) => n + c.articles.filter((a) => !a.read && a.content).length, 0
  );

  const clusterList = (
    <div className="space-y-10">
      {lib.clusters.map((cluster) => {
        const unread = cluster.articles.filter((a) => !a.read);
        if (unread.length === 0) return null;
        return (
          <section key={cluster.title} className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold">{cluster.title}</h2>
              {cluster.description && (
                <p className="text-sm text-muted mt-1">{cluster.description}</p>
              )}
            </div>
            <ul className="divide-y divide-black/5 dark:divide-white/5 border-y border-black/5 dark:border-white/5">
              {unread.map((a) => (
                <li key={a.slug} className="py-3">
                  <div className="flex items-baseline gap-3">
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
      })}
    </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Reading list</h1>
        <p className="mt-2 text-sm text-muted">
          {totalUnread} unread · {totalAvailable} fetched and readable offline
          {lib.generatedAt && <> · built {new Date(lib.generatedAt).toLocaleDateString()}</>}
        </p>
      </header>

      <Search>{clusterList}</Search>
    </div>
  );
}
