import { addDays, addMonths, diffDays, periodLength, periodOf, periodRange } from './dates'
import type { IsoDate, MonthKey, Transaction } from './types'

/** Plus: gelişmiş bütçe ayarları (Ayarlar kaydında saklanır). */
export interface BudgetPlan {
  /** Kategori kimliği → dönemlik limit (kuruş). */
  categoryLimits: Record<string, number>
  /** Haftalık (Pazartesi–Pazar) toplam limit. */
  weeklyKurus: number | null
  /** Önceki dönemde kullanılmayan bütçe bu döneme eklenir. */
  carryover: boolean
  /** Bu yüzdeye ulaşınca uyarılır (ör. 80). */
  warnPct: number
}

export const DEFAULT_BUDGET_PLAN: BudgetPlan = { categoryLimits: {}, weeklyKurus: null, carryover: false, warnPct: 80 }

export type LimitState = 'ok' | 'near' | 'over'

export interface LimitStatus {
  /** Ayarlanan limit. */
  limitKurus: number
  /** Önceki dönemden devreden (devir kapalıysa 0). */
  carryKurus: number
  /** limit + devir */
  effectiveKurus: number
  /** Net gider (gider − iade). */
  spentKurus: number
  /** Kullanım oranı (0–∞). */
  ratio: number
  state: LimitState
}

export interface CategoryLimitStatus extends LimitStatus {
  categoryId: string
}

export interface WeekStatus extends LimitStatus {
  start: IsoDate
  end: IsoDate
}

export interface Forecast {
  /** Dönemin kaçıncı günündeyiz (bugün dahil). */
  elapsedDays: number
  totalDays: number
  spentKurus: number
  /** Gerçekleşen + kalan günler için harcama temposu + kalan düzenli ödemeler/taksitler. */
  projectedKurus: number
  /** Tahmine eklenen, bugünden sonra kalan düzenli ödeme ve taksitler. */
  remainingFixedKurus: number
  /** Toplam bütçe varsa tahminin bütçeye göre durumu. */
  vsBudgetKurus: number | null
}

export interface BudgetStatus {
  total: LimitStatus | null
  categories: CategoryLimitStatus[]
  week: WeekStatus | null
  forecast: Forecast | null
  /** Uyarı verilecek limitler (önce aşılanlar). */
  warnings: Array<{ kind: 'total' | 'week' | 'category'; categoryId?: string; status: LimitStatus }>
}

function netOf(t: Transaction): number {
  if (t.type === 'expense') return Math.abs(t.amountKurus)
  if (t.type === 'refund') return -Math.abs(t.amountKurus)
  return 0
}

function stateOf(ratio: number, warnPct: number): LimitState {
  if (ratio > 1) return 'over'
  if (ratio * 100 >= warnPct) return 'near'
  return 'ok'
}

function status(limit: number, carry: number, spent: number, warnPct: number): LimitStatus {
  const effective = limit + carry
  const ratio = effective > 0 ? spent / effective : spent > 0 ? Infinity : 0
  return { limitKurus: limit, carryKurus: carry, effectiveKurus: effective, spentKurus: spent, ratio, state: stateOf(ratio, warnPct) }
}

/** Pazartesi başlayan haftanın ilk günü. */
export function weekStart(date: IsoDate): IsoDate {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Pazar
  return addDays(date, -((dow + 6) % 7))
}

/**
 * Seçili dönemin bütçe durumu.
 * - Ay sonu tahmini = gerçekleşen + (düzenli ödemeler hariç günlük tempo × kalan gün) + kalan düzenli ödemeler.
 * - Harcama net gidere göre ölçülür (iadeler düşülür, kart ödemesi/transfer sayılmaz).
 * - Devir yalnızca bir önceki dönemden gelir ve o dönemde kayıt varsa uygulanır; birikerek büyümez.
 * - Haftalık bütçe ve tahmin yalnızca içinde bulunulan dönem için hesaplanır.
 */
export function budgetStatus(
  txs: Transaction[],
  month: MonthKey,
  startDay: number,
  today: IsoDate,
  monthlyBudgetKurus: number | null,
  plan: BudgetPlan,
  fixed: { fixedSpentKurus: number; remainingKurus: number } = { fixedSpentKurus: 0, remainingKurus: 0 },
): BudgetStatus {
  const prev = addMonths(month, -1)
  let spent = 0
  let prevSpent = 0
  let prevHasData = false
  const byCat = new Map<string, number>()
  const prevByCat = new Map<string, number>()
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const p = periodOf(t.date, startDay)
    const n = netOf(t)
    if (p === month) {
      spent += n
      if (t.categoryId) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + n)
    } else if (p === prev) {
      prevHasData = true
      prevSpent += n
      if (t.categoryId) prevByCat.set(t.categoryId, (prevByCat.get(t.categoryId) ?? 0) + n)
    }
  }
  const carry = (limit: number, prevNet: number) => (plan.carryover && prevHasData ? Math.max(0, limit - Math.max(0, prevNet)) : 0)

  const total = monthlyBudgetKurus ? status(monthlyBudgetKurus, carry(monthlyBudgetKurus, prevSpent), spent, plan.warnPct) : null
  const categories: CategoryLimitStatus[] = Object.entries(plan.categoryLimits)
    .filter(([, limit]) => limit > 0)
    .map(([categoryId, limit]) => ({ categoryId, ...status(limit, carry(limit, prevByCat.get(categoryId) ?? 0), byCat.get(categoryId) ?? 0, plan.warnPct) }))
    .sort((a, b) => b.ratio - a.ratio)

  const isCurrent = periodOf(today, startDay) === month
  let week: WeekStatus | null = null
  if (isCurrent && plan.weeklyKurus) {
    const start = weekStart(today)
    const end = addDays(start, 6)
    let w = 0
    for (const t of txs) if (t.date >= start && t.date <= end) w += netOf(t)
    week = { start, end, ...status(plan.weeklyKurus, 0, w, plan.warnPct) }
  }

  let forecast: Forecast | null = null
  if (isCurrent) {
    const { start } = periodRange(month, startDay)
    const totalDays = periodLength(month, startDay)
    const elapsedDays = Math.min(totalDays, diffDays(today, start) + 1)
    // Düzenli ödemeler tempoya katılmaz (bir kez ödenir); kalanları ayrıca eklenir.
    const variable = Math.max(0, spent - fixed.fixedSpentKurus)
    const projected = Math.round(spent + (variable / elapsedDays) * (totalDays - elapsedDays) + fixed.remainingKurus)
    forecast = {
      elapsedDays,
      totalDays,
      spentKurus: spent,
      projectedKurus: projected,
      remainingFixedKurus: fixed.remainingKurus,
      vsBudgetKurus: total ? projected - total.effectiveKurus : null,
    }
  }

  const warnings: BudgetStatus['warnings'] = []
  if (total && total.state !== 'ok') warnings.push({ kind: 'total', status: total })
  if (week && week.state !== 'ok') warnings.push({ kind: 'week', status: week })
  for (const c of categories) if (c.state !== 'ok') warnings.push({ kind: 'category', categoryId: c.categoryId, status: c })
  warnings.sort((a, b) => (a.status.state === b.status.state ? b.status.ratio - a.status.ratio : a.status.state === 'over' ? -1 : 1))

  return { total, categories, week, forecast, warnings }
}
