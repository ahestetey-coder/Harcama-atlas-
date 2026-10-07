import { addDays, dayOf, diffDays, periodLength, periodOf, periodRange } from './dates'
import { isSpending, type Category, type MonthKey, type Transaction } from './types'

export interface CategoryTotal {
  categoryId: string | null
  expenseKurus: number
  refundKurus: number
  /** gider − iade; negatif olabilir. */
  netKurus: number
  count: number
}

export interface MonthSummary {
  month: MonthKey
  expenseKurus: number
  refundKurus: number
  netKurus: number
  transferKurus: number
  /** Dönemin gelirleri (harcama toplamlarına girmez). */
  incomeKurus: number
  incomeCount: number
  /** Gider + iade işlemleri (transferler hariç). */
  count: number
  transferCount: number
  byCategory: CategoryTotal[]
  topCategory: CategoryTotal | null
  /** Dönemin her günü sırayla; `day` ayın günüdür. */
  daily: Array<{ day: number; date: string; expenseKurus: number; refundKurus: number }>
}

/**
 * Bir ayın özeti. Yalnızca kaydedilmiş (onaylanmış) işlemleri alır.
 * - Kart ödemesi/transfer gider toplamına girmez.
 * - İade, kayıt tarihinin ayındaki net giderden düşülür (tutar pozitif saklanır; bir kez çıkarılır).
 */
export function summarizeMonth(all: Transaction[], month: MonthKey, upToDay?: number, startDay = 1): MonthSummary {
  const { start } = periodRange(month, startDay)
  const days = periodLength(month, startDay)
  const daily = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i)
    return { day: dayOf(date), date, expenseKurus: 0, refundKurus: 0 }
  })
  const cats = new Map<string | null, CategoryTotal>()
  let expense = 0
  let refund = 0
  let transfer = 0
  let income = 0
  let incomeCount = 0
  let count = 0
  let transferCount = 0
  for (const t of all) {
    if (periodOf(t.date, startDay) !== month) continue
    // Dönemin kaçıncı günü (takvim ayında ayın günüyle aynıdır)
    const day = diffDays(t.date, start) + 1
    if (upToDay !== undefined && day > upToDay) continue
    const amt = Math.abs(t.amountKurus)
    if (t.type === 'transfer') {
      transfer += amt
      transferCount++
      continue
    }
    if (t.type === 'income') {
      income += amt
      incomeCount++
      continue
    }
    count++
    const key = t.categoryId ?? null
    let c = cats.get(key)
    if (!c) {
      c = { categoryId: key, expenseKurus: 0, refundKurus: 0, netKurus: 0, count: 0 }
      cats.set(key, c)
    }
    c.count++
    if (t.type === 'expense') {
      expense += amt
      c.expenseKurus += amt
      daily[day - 1].expenseKurus += amt
    } else {
      refund += amt
      c.refundKurus += amt
      daily[day - 1].refundKurus += amt
    }
    c.netKurus = c.expenseKurus - c.refundKurus
  }
  const byCategory = [...cats.values()].sort((a, b) => b.expenseKurus - a.expenseKurus || b.netKurus - a.netKurus)
  const topCategory = byCategory.find((c) => c.expenseKurus > 0) ?? null
  return {
    month,
    expenseKurus: expense,
    refundKurus: refund,
    netKurus: expense - refund,
    transferKurus: transfer,
    incomeKurus: income,
    incomeCount,
    count,
    transferCount,
    byCategory,
    topCategory,
    daily,
  }
}

export type Comparison =
  | { kind: 'none'; reason: string }
  | {
      kind: 'ok'
      previousNetKurus: number
      diffKurus: number
      /** Önceki taban sıfır veya negatifse yüzde hesaplanmaz. */
      percent: number | null
      partial: boolean
      label: string
    }

/**
 * Önceki aya göre net gider değişimi.
 * - Önceki ayda hiç kayıt yoksa karşılaştırma yapılmaz.
 * - Taban sıfır/negatifse yüzde gösterilmez, yalnızca fark.
 * - İçinde bulunulan ay tamamlanmadıysa önceki ayın aynı gün aralığıyla karşılaştırılır ve etiketlenir.
 */
export function compareWithPrevious(all: Transaction[], month: MonthKey, previousMonth: MonthKey, today: string, startDay = 1): Comparison {
  const prevHasData = all.some((t) => periodOf(t.date, startDay) === previousMonth && isSpending(t))
  if (!prevHasData) return { kind: 'none', reason: 'Önceki ayda karşılaştırılacak kayıt yok.' }
  const isCurrent = periodOf(today, startDay) === month
  const upTo = isCurrent ? diffDays(today, periodRange(month, startDay).start) + 1 : undefined
  const cur = summarizeMonth(all, month, undefined, startDay)
  const prevUpTo = upTo !== undefined ? Math.min(upTo, periodLength(previousMonth, startDay)) : undefined
  const prev = summarizeMonth(all, previousMonth, prevUpTo, startDay)
  const diff = cur.netKurus - prev.netKurus
  const percent = prev.netKurus > 0 ? (diff / prev.netKurus) * 100 : null
  const label = isCurrent
    ? `Ay tamamlanmadı: önceki ayın ilk ${prevUpTo} günüyle karşılaştırıldı`
    : 'Önceki aya göre'
  return { kind: 'ok', previousNetKurus: prev.netKurus, diffKurus: diff, percent, partial: isCurrent, label }
}

export function isFutureMonth(month: MonthKey, today: string, startDay = 1): boolean {
  return month > periodOf(today, startDay)
}

export function categoryName(categories: Category[], id: string | null): string {
  if (!id) return 'Kategorisiz'
  return categories.find((c) => c.id === id)?.name ?? 'Bilinmeyen kategori'
}
