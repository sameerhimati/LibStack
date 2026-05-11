import Link from "next/link";
import { notFound } from "next/navigation";
import { allArticles, findBySlug } from "@/lib/articles";
import ModeBadge from "@/components/ModeBadge";

export function generateStaticParams() {
  return allArticles()
    .filter((a) => a.content)
    .map((a) => ({ slug: a.slug }));
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = findBySlug(params.slug);
  if (!article || !article.content) notFound();

  return (
    <article className="space-y-6">
      <div className="space-y-2">
        <Link href="/" className="text-sm text-muted hover:text-accent">← Back</Link>
        <div className="flex items-baseline gap-3">
          <ModeBadge mode={article.mode} />
          <h1 className="text-3xl font-semibold tracking-tight font-serif">{article.title}</h1>
        </div>
        <div className="text-sm text-muted">
          {article.byline && <span>{article.byline} · </span>}
          <span>{article.domain}</span>
          {" · "}
          <a href={article.url} className="underline hover:text-accent">original</a>
        </div>
        {article.description && (
          <p className="text-sm text-muted italic">{article.description}</p>
        )}
      </div>
      <div
        className="prose prose-stone dark:prose-invert font-serif"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </article>
  );
}
