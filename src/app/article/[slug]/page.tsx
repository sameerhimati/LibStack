import { notFound } from "next/navigation";
import { allArticles, findBySlug } from "@/lib/articles";
import ModeBadge from "@/components/ModeBadge";
import ArticleActions from "@/components/ArticleActions";
import LastOpenedRecorder from "@/components/LastOpenedRecorder";
import BackLink from "@/components/BackLink";

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
      <LastOpenedRecorder slug={article.slug} />
      <div className="space-y-3">
        <BackLink />
        <ArticleActions
          slug={article.slug}
          title={article.title}
          url={article.url}
          mode={article.mode}
          initialRead={article.read}
          existingNotes={article.existingNotes}
          existingNotesHtml={article.existingNotesHtml}
        />
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <ModeBadge mode={article.mode} />
            <h1 className="text-3xl font-semibold tracking-tight font-serif break-words">{article.title}</h1>
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
      </div>
      <div
        className="prose prose-stone dark:prose-invert font-serif"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </article>
  );
}
