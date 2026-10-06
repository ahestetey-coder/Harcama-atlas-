import { ArrowDownRight, ArrowUpRight, Info, Lightbulb, Store, TrendingDown, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from '../components/AppShell'
import { CategoryIcon, MonthSwitcher } from '../components/common'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Card, Segmented } from '../components/ui/primitives'
import { currentPeriod, MONTH_SHORT, periodLabel } from '../domain/dates'
import { formatKurus, formatKurusCompact } from '../domain/money'
import { periodReport, type Insight, type PeriodReport } from '../domain/reports'
import { cn } from '../lib/cn'
import { usePersonalCycle } from '../state/cycle'
import { useCategoryMap } from '../state/data'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'

/** Eğilim grafiği rengi (tek seri; açık ve koyu yüzeyde doğrulandı). */
const COLOR_TREND = '#059669'

export default function ReportsPage() {
  const { month, setMonth } = useUi()
  return (
    <div>
      <PageHeader
        title="Raporlar"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plus" /> Kişisel harcamalarınıza göre (Tümü)
          </span>
        }
        actions={<MonthSwitcher month={month} onChange={setMonth} />}
      />
      <PlanGate
        feature="reports"
        title="Ayrıntılı raporlar"
        points={[
          'Kategorileri önceki dönemle ve son 3 dönemin ortalamasıyla karşılaştırın',
          'En çok harcadığınız iş yerlerini görün',
          'Olağandışı artışlar ve tasarruf fırsatları için cihazda hazırlanan uyarılar alın',
          'Son 6 dönemin eğilimini izleyin',
        ]}
      >
        <ReportsContent />
      </PlanGate>
    </div>
  )
}

function ReportsContent() {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const catMap = useCategoryMap()
  const { month } = useUi()
  const ongoing = month === currentPeriod(startDay)
  const report = useMemo(
    () => (personal ? periodReport(personal.counted, month, startDay, (id) => (id ? (catMap.get(id)?.name ?? 'Diğer') : 'Kategorisiz'), ongoing) : null),
    [personal, month, startDay, catMap, ongoing],
  )
  if (!report) return null
  const diffPrev = report.currentKurus - report.previousKurus
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="flex flex-wrap gap-x-8 gap-y-3 p-5 lg:col-span-2" aria-label="Dönem özeti">
        <Stat label={periodLabel(month, startDay)} value={formatKurus(report.currentKurus)} />
        <Stat
          label="Önceki döneme göre"
          value={`${diffPrev > 0 ? '+' : diffPrev < 0 ? '−' : ''}${formatKurus(Math.abs(diffPrev))}`}
          icon={diffPrev > 0 ? <ArrowUpRight className="size-4 text-danger" /> : diffPrev < 0 ? <ArrowDownRight className="size-4 text-accent" /> : null}
        />
        {report.historyMonths > 0 && <Stat label={`Son ${report.historyMonths} dönem ortalaması`} value={formatKurus(report.averageKurus)} />}
        {ongoing && <p className="w-full text-[12px] text-subtle">Dönem sürüyor; karşılaştırmalar dönem sonuna kadar değişir.</p>}
      </Card>

      <Insights items={report.insights} history={report.historyMonths} />
      <Trend report={report} startDay={startDay} />
      <Categories report={report} />
      <Merchants report={report} />
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div>
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="num flex items-center gap-1 font-display text-xl font-semibold">
        {icon}
        {value}
      </div>
    </div>
  )
}

const INSIGHT_ICON: Record<Insight['tone'], ReactNode> = {
  warning: <TriangleAlert className="size-4 text-warning" />,
  good: <TrendingDown className="size-4 text-accent" />,
  info: <Info className="size-4 text-info" />,
}

function Insights({ items, history }: { items: Insight[]; history: number }) {
  return (
    <Card className="p-5 lg:col-span-2" aria-label="Tasarruf uyarıları">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Lightbulb className="size-5 text-warning" /> Bu dönem dikkat çekenler
      </h2>
      {history === 0 ? (
        <p className="mt-2 text-sm text-muted">Karşılaştırma için önceki dönemlerden kayıt gerekiyor. Geçmiş ekstrelerinizi içe aktarırsanız uyarılar burada görünür.</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Harcamalarınız önceki dönemlerle uyumlu; olağandışı bir artış yok.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((i, n) => (
            <li key={n} className="flex items-start gap-2.5 text-sm text-ink">
              <span className="mt-0.5 shrink-0">{INSIGHT_ICON[i.tone]}</span>
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-subtle">Uyarılar cihazınızda, son 3 dönemin ortalamasıyla karşılaştırılarak hazırlanır; hiçbir veri dışarı gönderilmez.</p>
    </Card>
  )
}

function Trend({ report, startDay }: { report: PeriodReport; startDay: number }) {
  const max = Math.max(1, ...report.trend.map((t) => t.netKurus))
  const avgPct = report.averageKurus > 0 ? (report.averageKurus / max) * 100 : null
  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-semibold">Son 6 dönem</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">Net harcama (iadeler düşülmüş)</p>
      <div className="relative mt-4 flex h-40 items-end gap-2 border-b border-line" aria-hidden>
        {avgPct !== null && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${avgPct}%` }}>
            <span className="absolute -top-4 left-0 text-[10.5px] text-subtle">ortalama</span>
          </div>
        )}
        {report.trend.map((t) => {
          const cur = t.month === report.month
          return (
            <div key={t.month} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className={cn('w-full max-w-10 rounded-t-[4px] transition-opacity group-hover:opacity-80', !cur && 'opacity-55')}
                style={{ height: `${t.netKurus > 0 ? Math.max(2, (t.netKurus / max) * 100) : 0}%`, background: COLOR_TREND }}
                title={`${periodLabel(t.month, startDay)}: ${formatKurus(t.netKurus)}`}
              />
              {cur && t.netKurus > 0 && <span className="num absolute -top-5 text-[11px] font-medium text-ink">{formatKurusCompact(t.netKurus)}</span>}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-2" aria-hidden>
        {report.trend.map((t) => (
          <span key={t.month} className={cn('flex-1 text-center text-[11.5px]', t.month === report.month ? 'font-semibold text-ink' : 'text-muted')}>
            {MONTH_SHORT[Number(t.month.split('-')[1]) - 1]}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Son 6 dönemin net harcaması</caption>
        <thead>
          <tr>
            <th>Dönem</th>
            <th>Net harcama</th>
          </tr>
        </thead>
        <tbody>
          {report.trend.map((t) => (
            <tr key={t.month}>
              <td>{periodLabel(t.month, startDay)}</td>
              <td>{formatKurus(t.netKurus)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Categories({ report }: { report: PeriodReport }) {
  const catMap = useCategoryMap()
  const [base, setBase] = useState<'avg' | 'prev'>('avg')
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Kategoriler</h2>
        <Segmented
          label="Karşılaştırma"
          value={base}
          onChange={setBase}
          options={[
            { value: 'avg', label: 'Ortalama' },
            { value: 'prev', label: 'Önceki' },
          ]}
        />
      </div>
      {report.categories.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Bu dönemde kayıt yok.</p>
      ) : (
        <table className="mt-3 w-full text-[13px]" aria-label="Kategori karşılaştırması">
          <thead>
            <tr className="text-left text-[12px] text-muted">
              <th className="pb-1.5 font-medium">Kategori</th>
              <th className="pb-1.5 text-right font-medium">Bu dönem</th>
              <th className="pb-1.5 text-right font-medium">{base === 'avg' ? 'Ortalama' : 'Önceki'}</th>
              <th className="pb-1.5 text-right font-medium">Fark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {report.categories.slice(0, 12).map((c) => {
              const ref = base === 'avg' ? c.averageKurus : c.previousKurus
              const d = c.currentKurus - ref
              const cat = c.categoryId ? catMap.get(c.categoryId) : undefined
              return (
                <tr key={c.categoryId ?? 'none'}>
                  <td className="py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <CategoryIcon category={cat} size="sm" />
                      <span className="truncate text-ink">{cat?.name ?? 'Kategorisiz'}</span>
                    </span>
                  </td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right font-medium text-ink">{formatKurusCompact(c.currentKurus)}</td>
                  <td className="num whitespace-nowrap py-2 pl-2 text-right text-muted">{formatKurusCompact(ref)}</td>
                  <td className={cn('num whitespace-nowrap py-2 pl-2 text-right font-medium', d > 0 ? 'text-danger' : d < 0 ? 'text-accent' : 'text-muted')}>
                    {d > 0 ? '+' : d < 0 ? '−' : ''}
                    {formatKurusCompact(Math.abs(d))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function Merchants({ report }: { report: PeriodReport }) {
  const top = report.merchants.slice(0, 10)
  const max = Math.max(1, ...top.map((m) => m.currentKurus))
  return (
    <Card className="p-5 lg:col-span-2">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Store className="size-5 text-accent" /> En çok harcanan iş yerleri
      </h2>
      {top.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Bu dönemde iş yeri harcaması yok.</p>
      ) : (
        <ul className="mt-3 space-y-2.5" aria-label="İş yerleri">
          {top.map((m) => (
            <li key={m.key} className="text-[13px]">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{m.name}</span>
                <span className="shrink-0 text-[12px] text-muted">{m.count} işlem</span>
                <span className="num w-28 shrink-0 text-right font-semibold">{formatKurus(m.currentKurus)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${(m.currentKurus / max) * 100}%`, background: COLOR_TREND }} />
                </div>
                <span className="w-28 shrink-0 text-right text-[11.5px] text-subtle">{m.previousKurus > 0 ? `önceki ${formatKurusCompact(m.previousKurus)}` : 'önceki dönemde yok'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
