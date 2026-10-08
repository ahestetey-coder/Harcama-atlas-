import { addMonths, periodOf } from './dates'
import { merchantKey } from './normalize'
import { isSpending, type IsoDate, type MonthKey, type Transaction } from './types'

/**
 * Koçun otomatik bütçesi: gelirden önce birikim (hedefler ve birikim payı) ayrılır; kalan tutar
 * dönemlik toplam bütçedir. Düzenli ödemeler ve borç/taksit ödemeleri bu bütçenin içinde
 * sabit kısımdır, geri kalanı serbest harcamadır ve kategorilere geçmiş harcamaya göre dağıtılır.
 * Kural tabanlıdır; cihazda hesaplanır, hiçbir veri dışarı gönderilmez.
 */

export type BudgetMode = 'auto' | 'manual'

export interface AutoBudgetGoal {
  id: string
  name: string
  monthlyKurus: number
}

export interface CategoryAverage {
  categoryId: string
  averageKurus: number
}

export interface AutoBudgetInput {
  /** Aylık gelir; bilinmiyorsa null (otomatik bütçe kurulamaz). */
  incomeKurus: number | null
  incomeSource: 'records' | 'journey' | null
  /** Dönemdeki düzenli ödemeler (fatura, abonelik). */
  recurringKurus: number
  /** Dönemdeki borç ve taksit ödemeleri. */
  debtKurus: number
  /** Birikim hedefleri için ayda ayrılması gereken tutarlar. */
  goals: AutoBudgetGoal[]
  /** Gelirin en az bu kadarı birikime ayrılır (hedefler buna dahildir). */
  minSavingRate: number
  /** Serbest harcamanın kategorilere dağıtımı için geçmiş ortalamalar; null ise kategori limiti üretilmez. */
  categoryAverages: CategoryAverage[] | null
  /** Haftalık bütçe üretilsin mi (Plus). */
  weekly: boolean
  /** Dönemin gün sayısı. */
  periodDays: number
}

export interface AutoBudget {
  incomeKurus: number
  incomeSource: 'records' | 'journey'
  /** Toplam birikim payı (hedefler + ek birikim). */
  savingKurus: number
  goalsKurus: number
  /** Hedeflerin üstüne ayrılan genel birikim payı. */
  extraSavingKurus: number
  /** Gider gelire sığmadığı için birikimden kısılan tutar. */
  savingCutKurus: number
  recurringKurus: number
  debtKurus: number
  /** Serbest harcama (toplam − düzenli − borç). */
  flexibleKurus: number
  /** Dönemlik toplam bütçe. */
  totalKurus: number
  weeklyKurus: number | null
  categoryLimits: Record<string, number>
  /** Son dönemlerdeki aylık serbest harcama ortalaması (kategori ortalamaları verildiyse). */
  historyKurus: number | null
  /** Kategori limitleri geçmiş ortalamadan yüzde kaç düşük (0 = kısıntı yok). */
  cutPct: number
  /** Zorunlu ödemeler gelirden fazlaysa açık. */
  shortfallKurus: number
}

/** En fazla bu kadar kategoriye limit konur (en çok harcananlar). */
export const AUTO_MAX_CATEGORIES = 6
/** Serbest harcamanın en az bu payını alan kategoriler limitlenir. */
const MIN_CATEGORY_SHARE = 0.03

const floorTo = (k: number, step: number) => Math.max(0, Math.floor(k / step) * step)
const TL = 100

export function suggestBudget(input: AutoBudgetInput): AutoBudget | null {
  const income = input.incomeKurus
  if (!income || income <= 0 || !input.incomeSource) return null
  const goalsKurus = input.goals.reduce((s, g) => s + Math.max(0, g.monthlyKurus), 0)
  const wanted = Math.max(goalsKurus, Math.round(income * input.minSavingRate))
  const obligations = input.recurringKurus + input.debtKurus
  // Zorunlu ödemeler önce gelir; birikim sığmıyorsa kısılır
  const saving = Math.max(0, Math.min(wanted, income - obligations))
  const shortfall = Math.max(0, obligations - income)
  const total = Math.max(obligations, floorTo(income - saving, 100 * TL))
  const flexible = Math.max(0, total - obligations)

  let categoryLimits: Record<string, number> = {}
  let cutPct = 0
  let history: number | null = null
  if (input.categoryAverages) {
    const all = input.categoryAverages.filter((c) => c.averageKurus > 0)
    const sum = all.reduce((s, c) => s + c.averageKurus, 0)
    history = sum || null
    const top = all
      .filter((c) => sum > 0 && c.averageKurus / sum >= MIN_CATEGORY_SHARE)
      .sort((a, b) => b.averageKurus - a.averageKurus)
      .slice(0, AUTO_MAX_CATEGORIES)
    // Serbest harcama geçmiş ortalamaya yetmiyorsa bütün kategoriler aynı oranda kısılır
    const ratio = sum > flexible ? flexible / sum : 1
    cutPct = sum > 0 ? Math.round((1 - ratio) * 100) : 0
    categoryLimits = Object.fromEntries(top.map((c) => [c.categoryId, floorTo(c.averageKurus * ratio, 50 * TL)]).filter(([, v]) => (v as number) > 0))
  }
  const weekly = input.weekly && flexible > 0 ? floorTo((flexible * 7) / Math.max(1, input.periodDays), 50 * TL) || null : null

  return {
    incomeKurus: income,
    incomeSource: input.incomeSource,
    savingKurus: saving,
    goalsKurus: Math.min(goalsKurus, saving),
    extraSavingKurus: Math.max(0, saving - goalsKurus),
    savingCutKurus: Math.max(0, wanted - saving),
    recurringKurus: input.recurringKurus,
    debtKurus: input.debtKurus,
    flexibleKurus: flexible,
    totalKurus: total,
    weeklyKurus: weekly,
    categoryLimits,
    historyKurus: history,
    cutPct,
    shortfallKurus: shortfall,
  }
}

/** Son `count` tamamlanmış dönemde gelir olan dönemlerin ortalama geliri; kayıt yoksa null. */
export function averageMonthlyIncome(txs: Transaction[], startDay: number, today: IsoDate, count = 3): number | null {
  const current = periodOf(today, startDay)
  const wanted = new Set<MonthKey>(Array.from({ length: count }, (_, i) => addMonths(current, -(i + 1))))
  const totals = new Map<MonthKey, number>()
  for (const t of txs) {
    if (t.type !== 'income') continue
    const p = periodOf(t.date, startDay)
    if (!wanted.has(p)) continue
    totals.set(p, (totals.get(p) ?? 0) + Math.abs(t.amountKurus))
  }
  if (totals.size) return Math.round([...totals.values()].reduce((a, b) => a + b, 0) / totals.size)
  // Geçmiş dönemde gelir yoksa bu dönemdeki gelir kullanılır
  let now = 0
  for (const t of txs) if (t.type === 'income' && periodOf(t.date, startDay) === current) now += Math.abs(t.amountKurus)
  return now > 0 ? now : null
}

/**
 * Serbest harcamanın kategori ortalamaları (son `count` tamamlanmış dönem). Taksitler, planlı
 * taksitler ve düzenli ödeme olarak tanınan harcamalar sabit kısımda sayıldığı için dışarıda kalır.
 */
export function flexibleCategoryAverages(txs: Transaction[], startDay: number, today: IsoDate, fixedKeys: Set<string>, count = 3): CategoryAverage[] {
  const current = periodOf(today, startDay)
  const wanted = new Set<MonthKey>(Array.from({ length: count }, (_, i) => addMonths(current, -(i + 1))))
  const months = new Set<MonthKey>()
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (!isSpending(t)) continue
    const p = periodOf(t.date, startDay)
    if (!wanted.has(p)) continue
    months.add(p)
    if (!t.categoryId || t.installment || t.source === 'planned' || fixedKeys.has(merchantKey(t.description))) continue
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + (t.type === 'expense' ? t.amountKurus : -t.amountKurus))
  }
  if (!months.size) return []
  return [...totals.entries()].map(([categoryId, k]) => ({ categoryId, averageKurus: Math.max(0, Math.round(k / months.size)) })).filter((c) => c.averageKurus > 0)
}
