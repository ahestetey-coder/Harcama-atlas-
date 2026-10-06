import { addMonths, periodOf } from './dates'
import { cleanDescription, merchantKey } from './normalize'
import type { MonthKey, Transaction } from './types'

const net = (t: Transaction) => (t.type === 'expense' ? t.amountKurus : t.type === 'refund' ? -t.amountKurus : 0)

export interface CategoryCompare {
  categoryId: string | null
  currentKurus: number
  previousKurus: number
  /** Önceki 3 dönemin ortalaması (kayıt olan dönemlerden). */
  averageKurus: number
  diffVsAverage: number
}

export interface MerchantRow {
  key: string
  name: string
  currentKurus: number
  previousKurus: number
  count: number
}

export interface TrendPoint {
  month: MonthKey
  netKurus: number
}

export interface Insight {
  kind: 'category-up' | 'category-down' | 'merchant-new' | 'total-up'
  tone: 'warning' | 'good' | 'info'
  text: string
  categoryId?: string | null
  amountKurus: number
}

export interface PeriodReport {
  month: MonthKey
  currentKurus: number
  previousKurus: number
  averageKurus: number
  /** Önceki 3 dönemden kaçında kayıt var. */
  historyMonths: number
  categories: CategoryCompare[]
  merchants: MerchantRow[]
  trend: TrendPoint[]
  insights: Insight[]
}

/**
 * Dönem raporu: kategori ve iş yeri karşılaştırmaları, son 6 dönemin eğilimi ve cihazda çalışan
 * kurallarla tasarruf uyarıları. Kart ödemesi/transfer sayılmaz; iadeler düşülür.
 */
export function periodReport(
  txs: Transaction[],
  month: MonthKey,
  startDay: number,
  names: (categoryId: string | null) => string,
  /** Dönem sürüyorsa "ortalamanın altında" mesajları verilmez (dönem henüz bitmedi). */
  ongoing = false,
): PeriodReport {
  const prevs = [1, 2, 3].map((i) => addMonths(month, -i))
  const byMonthCat = new Map<string, Map<string | null, number>>()
  const totals = new Map<string, number>()
  const merchants = new Map<string, MerchantRow>()
  const trendMonths = [5, 4, 3, 2, 1, 0].map((i) => addMonths(month, -i))
  const trend = new Map(trendMonths.map((m) => [m, 0]))
  const prevMerchantKeys = new Set<string>()
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const p = periodOf(t.date, startDay)
    const n = net(t)
    if (trend.has(p)) trend.set(p, trend.get(p)! + n)
    if (p !== month && !prevs.includes(p)) continue
    totals.set(p, (totals.get(p) ?? 0) + n)
    let cats = byMonthCat.get(p)
    if (!cats) byMonthCat.set(p, (cats = new Map()))
    cats.set(t.categoryId ?? null, (cats.get(t.categoryId ?? null) ?? 0) + n)
    if (t.type !== 'expense') continue
    const key = merchantKey(t.description) || t.normalizedDescription
    if (!key) continue
    if (p !== month) prevMerchantKeys.add(key)
    if (p !== month && p !== prevs[0]) continue
    let m = merchants.get(key)
    if (!m) merchants.set(key, (m = { key, name: cleanDescription(t.description), currentKurus: 0, previousKurus: 0, count: 0 }))
    if (p === month) {
      m.currentKurus += t.amountKurus
      m.count++
    } else m.previousKurus += t.amountKurus
  }
  const history = prevs.filter((p) => byMonthCat.has(p))
  const avg = (vals: number[]) => (vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0)
  const catIds = new Set<string | null>()
  for (const p of [month, ...prevs]) for (const k of byMonthCat.get(p)?.keys() ?? []) catIds.add(k)
  const categories: CategoryCompare[] = [...catIds]
    .map((id) => {
      const current = byMonthCat.get(month)?.get(id) ?? 0
      const average = avg(history.map((p) => byMonthCat.get(p)?.get(id) ?? 0))
      return { categoryId: id, currentKurus: current, previousKurus: byMonthCat.get(prevs[0])?.get(id) ?? 0, averageKurus: average, diffVsAverage: current - average }
    })
    .filter((c) => c.currentKurus || c.averageKurus)
    .sort((a, b) => b.currentKurus - a.currentKurus)

  const current = totals.get(month) ?? 0
  const average = avg(history.map((p) => totals.get(p) ?? 0))
  const insights: Insight[] = []
  if (history.length >= 1) {
    if (average > 0 && current > average * 1.15 && current - average >= 50000)
      insights.push({ kind: 'total-up', tone: 'warning', text: `Toplam harcama, önceki ${history.length} dönemin ortalamasından %${Math.round(((current - average) / average) * 100)} fazla.`, amountKurus: current - average })
    for (const c of categories) {
      if (c.averageKurus > 0 && c.currentKurus > c.averageKurus * 1.3 && c.diffVsAverage >= 50000)
        insights.push({
          kind: 'category-up',
          tone: 'warning',
          categoryId: c.categoryId,
          text: `${names(c.categoryId)} ortalamanın %${Math.round((c.diffVsAverage / c.averageKurus) * 100)} üstünde. Ortalamaya inerseniz bu dönem ${formatTl(c.diffVsAverage)} tasarruf edersiniz.`,
          amountKurus: c.diffVsAverage,
        })
      else if (!ongoing && c.averageKurus >= 50000 && c.currentKurus < c.averageKurus * 0.7)
        insights.push({ kind: 'category-down', tone: 'good', categoryId: c.categoryId, text: `${names(c.categoryId)} ortalamanın altında; ${formatTl(-c.diffVsAverage)} daha az harcadınız.`, amountKurus: -c.diffVsAverage })
    }
    for (const m of merchants.values())
      if (!prevMerchantKeys.has(m.key) && m.currentKurus >= 200000)
        insights.push({ kind: 'merchant-new', tone: 'info', text: `${m.name}: önceki dönemlerde olmayan ${formatTl(m.currentKurus)} tutarında yeni harcama.`, amountKurus: m.currentKurus })
  }
  insights.sort((a, b) => (a.tone === b.tone ? b.amountKurus - a.amountKurus : a.tone === 'warning' ? -1 : b.tone === 'warning' ? 1 : 0))

  return {
    month,
    currentKurus: current,
    previousKurus: totals.get(prevs[0]) ?? 0,
    averageKurus: average,
    historyMonths: history.length,
    categories,
    merchants: [...merchants.values()].filter((m) => m.currentKurus > 0).sort((a, b) => b.currentKurus - a.currentKurus),
    trend: trendMonths.map((m) => ({ month: m, netKurus: trend.get(m)! })),
    insights: insights.slice(0, 6),
  }
}

function formatTl(kurus: number): string {
  return `${Math.round(kurus / 100).toLocaleString('tr-TR')} ₺`
}
