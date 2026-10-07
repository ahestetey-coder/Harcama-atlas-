import { ChevronDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { CONTENT_LABEL, REPORT_KIND_LABEL, SECTION_KEYS, SECTION_TITLE, type ContentType, type Report, type ReportTopic } from '../cloud/research'
import { cn } from '../lib/cn'
import { Badge } from './ui/primitives'

const TYPE_TONE: Record<ContentType, 'neutral' | 'accent' | 'warning' | 'info' | 'teal'> = {
  resmi_veri: 'teal',
  sirket_aciklamasi: 'info',
  haber: 'neutral',
  uzman_yorumu: 'accent',
  tahmin: 'warning',
}

const fmtDate = (iso: string, time = false) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) })

export function TypeBadge({ type }: { type: ContentType }) {
  return <Badge tone={TYPE_TONE[type]}>{CONTENT_LABEL[type]}</Badge>
}

/** Rapor başlığı: tür, yayın zamanı ve kapsadığı dönem. Eski raporu açıkça eski gösterir. */
export function ReportMeta({ r }: { r: Report }) {
  const at = r.published_at ?? r.created_at
  const [now] = useState(() => Date.now())
  const ageDays = (now - Date.parse(at)) / 86400000
  const stale = (r.kind === 'gunluk' || r.kind === 'acil') && ageDays > 1.5
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle">
      <Badge tone={r.kind === 'acil' ? 'danger' : 'neutral'}>{REPORT_KIND_LABEL[r.kind]}</Badge>
      <span>
        {r.published_at ? 'Yayın' : 'Taslak'}: {fmtDate(at, true)}
      </span>
      <span>
        · Kapsam: {fmtDate(r.window_start)} – {fmtDate(r.window_end)}
      </span>
      {stale && <Badge tone="warning">Bu rapor {Math.floor(ageDays)} gün önce yayınlandı; daha yenisi yok</Badge>}
    </div>
  )
}

function Refs({ refs, topicIdx, reportId }: { refs: number[]; topicIdx: number; reportId: string }) {
  if (!refs.length) return null
  return (
    <span className="ml-1 inline-flex gap-0.5 align-super text-[10.5px]">
      {refs.map((n) => (
        <a key={n} href={`#kaynak-${reportId}-${topicIdx}-${n}`} onClick={(e) => {
          e.preventDefault()
          document.getElementById(`kaynak-${reportId}-${topicIdx}-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }} className="rounded bg-accent-soft px-1 font-semibold text-accent-strong hover:underline dark:text-accent" aria-label={`Kaynak ${n}`}>
          {n}
        </a>
      ))}
    </span>
  )
}

export function TopicView({ t, idx, reportId, open }: { t: ReportTopic; idx: number; reportId: string; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold text-ink">{t.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{t.sections.ne_oldu?.text}</span>
        </span>
        <ChevronDown className="mt-0.5 size-5 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="flex flex-col gap-3 border-t border-line px-4 py-3 text-[13.5px]">
        {SECTION_KEYS.map((k, i) => (
          <li key={k}>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-subtle">
              {i + 1}. {SECTION_TITLE[k]}
            </div>
            <p className="mt-0.5 text-ink">
              {t.sections[k]?.text}
              <Refs refs={t.sections[k]?.refs ?? []} topicIdx={idx} reportId={reportId} />
            </p>
          </li>
        ))}
        <li>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-subtle">7. {SECTION_TITLE.kaynaklar}</div>
          <ul className="mt-1 flex flex-col gap-1.5">
            {t.sources.map((s) => (
              <li key={s.n} id={`kaynak-${reportId}-${idx}-${s.n}`} className="flex scroll-mt-24 items-start gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <span className="mt-0.5 w-5 shrink-0 text-[12px] font-semibold text-subtle">[{s.n}]</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={s.type} />
                    {s.personal !== undefined && <Badge tone="neutral">{s.personal ? 'Kişisel görüş' : 'Kurum adına'}</Badge>}
                  </span>
                  <a
                    href={/^https?:\/\//i.test(s.url) ? s.url : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-[12.5px] text-ink hover:text-accent"
                  >
                    {s.title} <ExternalLink className="inline size-3" />
                  </a>
                  <span className="block text-[11.5px] text-subtle">
                    {s.author ? `${s.author} · ` : ''}
                    {s.institution} · yayın {fmtDate(s.publishedAt, true)}
                    {s.period ? ` · dönem ${s.period}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </li>
      </ol>
    </details>
  )
}

export function ReportView({ r, className, openFirst }: { r: Report; className?: string; openFirst?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {r.topics.map((t, i) => (
        <TopicView key={i} t={t} idx={i} reportId={r.id} open={openFirst && i === 0} />
      ))}
    </div>
  )
}
