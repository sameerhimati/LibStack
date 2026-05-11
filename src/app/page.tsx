import { loadLibrary } from "@/lib/articles";
import Search from "@/components/Search";
import ClusterSection from "@/components/ClusterSection";

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
      {lib.clusters.map((cluster) => (
        <ClusterSection key={cluster.title} cluster={cluster} />
      ))}
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
