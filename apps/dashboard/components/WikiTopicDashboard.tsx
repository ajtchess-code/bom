"use client";
import Link from "next/link";
import WikiReader from "./WikiReader";
import WikiCharts from "./WikiCharts";
import { MarkdownLite, SystemArticle } from "./WikiPortalDashboard";
export default function WikiTopicDashboard({ article, admin = false }: { article: any; admin?: boolean }) {
  return (
    <WikiReader
      title={article.title}
      summary={article.summary}
      category={String(article.category ?? "Guide").replaceAll("_", " ")}
      slug={article.slug}
      admin={admin}
      sources={article.sourceMeta?.sources ?? []}
      asOf={article.sourceMeta?.asOf}
    >
      {article.system ? (
        <>
          <WikiCharts article={article} />
          <SystemArticle
            article={article}
            onEntity={(k) => (location.href = `/dashboard/wiki/article/${encodeURIComponent(k)}`)}
          />
        </>
      ) : (
        <MarkdownLite text={article.content ?? ""} />
      )}
      {(article.related?.length > 0 || article.referencedBy?.length > 0) && (
        <section>
          <h2>See also</h2>
          <ul>
            {[...(article.related ?? []), ...(article.referencedBy ?? [])]
              .filter((v, i, a) => a.findIndex((x) => x.slug === v.slug) === i)
              .map((x: any) => (
                <li key={x.slug}>
                  <Link href={`/dashboard/wiki/topic/${encodeURIComponent(x.slug)}`}>{x.title}</Link>
                  {x.summary && ` — ${x.summary}`}
                </li>
              ))}
          </ul>
        </section>
      )}
    </WikiReader>
  );
}
