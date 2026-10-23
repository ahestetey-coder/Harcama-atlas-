import { ArrowLeft, Newspaper } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PlanGate } from '../components/PlanGate'
import { Card, EmptyState, Skeleton } from '../components/ui/primitives'
import { CATEGORY_LABEL, parseMarkdown, visibleArticles, type ArticleMeta, type Inline } from '../domain/gundem'
import { cn } from '../lib/cn'
import { dateLocale, getLang, tt } from '../lib/i18n'
import { useArticleBody, useArticles, useNow } from '../state/gundem'

function when(iso: string): string {
  return new Date(iso).toLocaleString(dateLocale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

/** Finansal Gündem'deki tek bir yazı (liste LearningPage'de). Yalnızca Plus+. */
export default function GundemPage() {
  const { slug } = useParams()
  if (!slug) return <Navigate to="/ogren" replace />
  return (
    <PlanGate feature="learning" title={tt('Finansal Gündem')} points={[tt('Günde iki kez güncellenen piyasa notları ve finans yazıları'), tt('Yeni yazı gelince koçtan bildirim')]}>
      <ArticleView slug={slug} />
    </PlanGate>
  )
}

export function ArticleCard({ a, compact }: { a: ArticleMeta; compact?: boolean }) {
  const lang = getLang()
  return (
    <Link to={`/gundem/${a.slug}`} className="group block">
      <Card className="h-full overflow-hidden p-0 transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
        {a.cover && !compact && (
          <img src={a.cover} alt={a.coverAlt?.[lang] ?? ''} loading="lazy" className="aspect-[16/9] w-full bg-surface-2 object-cover" />
        )}
        <div className={cn('flex gap-3', compact ? 'p-4' : 'flex-col p-5')}>
          {a.cover && compact && <img src={a.cover} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl bg-surface-2 object-cover" />}
          <div className="min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-accent">
              {CATEGORY_LABEL[a.category]} · <span className="font-medium normal-case text-muted">{when(a.publishAt)}</span>
            </div>
            <h3 className={cn('mt-1 font-display font-bold leading-snug text-ink', compact ? 'line-clamp-2 text-[15px]' : 'text-lg')}>{a.title[lang] || a.title.tr}</h3>
            {!compact && <p className="mt-1.5 line-clamp-3 text-sm text-muted">{a.summary[lang] || a.summary.tr}</p>}
          </div>
        </div>
      </Card>
    </Link>
  )
}

function Text({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold text-ink">{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  )
}

function ArticleView({ slug }: { slug: string }) {
  const all = useArticles()
  const now = useNow()
  const meta = all ? visibleArticles(all, now).find((a) => a.slug === slug) : undefined
  const body = useArticleBody(meta ? slug : undefined)
  const lang = getLang()
  const back = (
    <Link to="/ogren" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
      <ArrowLeft className="size-4" /> {tt('Finansal Gündem')}
    </Link>
  )
  if (!all) return <Skeleton className="h-96" />
  if (!meta)
    return (
      <div>
        {back}
        <EmptyState icon={<Newspaper className="size-6" />} title={tt('Yazı bulunamadı')}>
          {tt('Yazı henüz yayına girmemiş ya da kaldırılmış olabilir.')}
        </EmptyState>
      </div>
    )
  const blocks = body && body !== 'error' ? parseMarkdown(body.body[lang] || body.body.tr) : null
  return (
    <article className="mx-auto max-w-2xl">
      {back}
      <div className="text-[12px] font-semibold uppercase tracking-wide text-accent">
        {CATEGORY_LABEL[meta.category]} · <span className="font-medium normal-case text-muted">{when(meta.publishAt)}</span>
      </div>
      <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight text-ink">{meta.title[lang] || meta.title.tr}</h1>
      {meta.cover && <img src={meta.cover} alt={meta.coverAlt?.[lang] ?? ''} className="mt-4 aspect-[16/9] w-full rounded-2xl bg-surface-2 object-cover" />}
      {body === 'error' && <p className="mt-6 text-sm text-muted">{tt('Yazı yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.')}</p>}
      {!body && <Skeleton className="mt-6 h-72" />}
      {blocks && (
        <div className="mt-6 space-y-4 text-[15.5px] leading-relaxed text-ink/90">
          {blocks.map((b, i) => {
            switch (b.type) {
              case 'h':
                return (
                  <h2 key={i} className="pt-2 font-display text-lg font-bold text-ink">
                    {b.text}
                  </h2>
                )
              case 'p':
                return (
                  <p key={i}>
                    <Text parts={b.parts} />
                  </p>
                )
              case 'ul':
                return (
                  <ul key={i} className="list-disc space-y-1.5 pl-5">
                    {b.items.map((it, j) => (
                      <li key={j}>
                        <Text parts={it} />
                      </li>
                    ))}
                  </ul>
                )
              case 'img':
                return <img key={i} src={b.src} alt={b.alt} loading="lazy" className="aspect-[16/9] w-full rounded-2xl bg-surface-2 object-cover" />
              case 'table':
                return (
                  <div key={i} className="-mx-4 overflow-x-auto px-4">
                    <table className="w-full min-w-[480px] border-collapse text-[13.5px]">
                      <thead>
                        <tr>
                          {b.head.map((h, j) => (
                            <th key={j} className="border-b border-line px-2 py-2 text-left font-semibold text-ink">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((r, j) => (
                          <tr key={j}>
                            {r.map((c, k) => (
                              <td key={k} className="border-b border-line/60 px-2 py-2 align-top">
                                {c}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            }
          })}
        </div>
      )}
    </article>
  )
}
