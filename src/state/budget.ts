import { useMemo } from 'react'
import { averageMonthlyIncome, flexibleCategoryAverages, suggestBudget, type AutoBudget, type AutoBudgetGoal, type BudgetMode } from '../domain/autoBudget'
import { budgetStatus, DEFAULT_BUDGET_PLAN, type BudgetPlan, type BudgetStatus } from '../domain/budget'
import { currentPeriod, periodLength, todayIso } from '../domain/dates'
import { goalProgress } from '../domain/goals'
import { addMonthsClamped, fixedPayments, futureLoad, installmentPlans, progressOf, upcomingPayments, type DuePayment } from '../domain/recurring'
import { CONSUMER_DEBT, debtMonthlyPayment, debtTypeOf, holdingSummary, INSTALLMENT_DEBT, portfolio } from '../domain/assets'
import { estimatedMinPayment } from '../domain/coach'
import { averageMonthlyExpense, SAVING_RATE_TARGET, SPEND_GROUPS, spendGroupOf, type JourneyFacts, type RecurringLoad, type SpendBreakdown } from '../domain/journey'
import type { CoachDebt } from '../domain/coach'
import { usePersonalCycle } from './cycle'
import { useAssets, useCategories, useGoals, useRecurring, useSettings } from './data'
import { useAllRecurring, usePersonalTransactions } from './personal'
import { usePlan } from './plan'

/** Koçun otomatik bütçesi; paketteki özellikler kadar veri kullanır (cihazda, kural tabanlı). */
export function useAutoBudget(): AutoBudget | null | undefined {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const settings = useSettings()
  const items = useAllRecurring()
  const assets = useAssets()
  const goals = useGoals()
  const { has } = usePlan()
  return useMemo(() => {
    if (!personal || !settings || !items || !assets || !goals) return undefined
    const today = todayIso()
    const period = currentPeriod(startDay)
    let income = averageMonthlyIncome(personal.counted, startDay, today)
    let source: 'records' | 'journey' | null = income ? 'records' : null
    const j = has('journey') ? settings.journey : undefined
    if (!income && j && j.monthlyIncomeKurus > 0) {
      income = j.monthlyIncomeKurus + (j.passiveIncomeKurus ?? 0)
      source = 'journey'
    }
    // Pakette olmayan özelliklerin verisi hesaba katılmaz
    const used = items.filter((i) =>
      i.kind !== 'installment' ? has('subscriptions') : i.id.startsWith('debt:') ? has('assets') : has('installments'),
    )
    const manualKeys = new Set(items.filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!))
    const plans = has('installments') ? installmentPlans(personal.counted, manualKeys) : []
    const load = futureLoad(used, plans, period, 1, startDay)[0]
    let debt = load?.installmentKurus ?? 0
    if (has('assets'))
      for (const a of assets) {
        if (a.archived || a.kind !== 'debt' || a.debtPlan?.mode === 'monthly' || !INSTALLMENT_DEBT.includes(debtTypeOf(a))) continue
        const bal = holdingSummary(a, today).valueKurus
        if (bal > 0 && a.debtTerms?.minPaymentKurus) debt += Math.min(bal, a.debtTerms.minPaymentKurus)
      }
    const goalRows: AutoBudgetGoal[] = []
    if (has('goals'))
      for (const g of goals) {
        if (g.archived) continue
        const p = goalProgress(g, today)
        if (p.status === 'done') continue
        const monthly = p.monthlyNeededKurus ?? p.monthlyAverageKurus
        if (monthly > 0) goalRows.push({ id: g.id, name: g.name, monthlyKurus: monthly })
      }
    const advanced = has('advancedBudget')
    const fixedKeys = new Set(used.filter((i) => i.active && i.matchKey).map((i) => i.matchKey!))
    return suggestBudget({
      incomeKurus: income,
      incomeSource: source,
      recurringKurus: load?.recurringKurus ?? 0,
      debtKurus: debt,
      goals: goalRows,
      minSavingRate: j ? SAVING_RATE_TARGET : 0.1,
      categoryAverages: advanced ? flexibleCategoryAverages(personal.counted, startDay, today, fixedKeys) : null,
      weekly: advanced,
      periodDays: periodLength(period, startDay),
    })
  }, [personal, settings, items, assets, goals, has, startDay])
}

export interface BudgetSetup {
  mode: BudgetMode
  /** Koç bütçe kurabildi mi (otomatikte gelir yoksa elle girilen değerler kullanılır). */
  auto: AutoBudget | null
  monthlyKurus: number | null
  plan: BudgetPlan
}

export function budgetModeOf(s: { budgetMode?: BudgetMode; monthlyBudgetKurus: number | null; budgetPlan?: BudgetPlan }): BudgetMode {
  if (s.budgetMode) return s.budgetMode
  const p = s.budgetPlan
  return s.monthlyBudgetKurus || p?.weeklyKurus || Object.keys(p?.categoryLimits ?? {}).length ? 'manual' : 'auto'
}

/** Geçerli bütçe: otomatikte koçun hesapladığı, elle modda kullanıcının girdiği değerler. */
export function useBudgetSetup(): BudgetSetup | undefined {
  const settings = useSettings()
  const auto = useAutoBudget()
  const { has } = usePlan()
  return useMemo(() => {
    if (!settings || auto === undefined) return undefined
    // Koçun otomatik bütçesi Plus ve Plus+'ta; Ücretsiz pakette bütçe her zaman elle belirlenir
    const mode = has('advancedBudget') ? budgetModeOf(settings) : 'manual'
    const plan = settings.budgetPlan ?? DEFAULT_BUDGET_PLAN
    if (mode === 'manual' || !auto) return { mode, auto, monthlyKurus: settings.monthlyBudgetKurus, plan }
    return {
      mode,
      auto,
      monthlyKurus: auto.totalKurus,
      plan: has('advancedBudget') ? { ...plan, categoryLimits: auto.categoryLimits, weeklyKurus: auto.weeklyKurus } : plan,
    }
  }, [settings, auto, has])
}

/** Kişisel (Tümü) bütçe durumu; düzenli ödemeler ve taksitler ay sonu tahminine katılır. */
export function useBudgetStatus(month: string, enabled = true): BudgetStatus | null {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const setup = useBudgetSetup()
  const recurring = useAllRecurring()
  return useMemo(() => {
    if (!enabled || !personal || !setup) return null
    const today = todayIso()
    const items = recurring ?? []
    const manual = new Set(items.filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!))
    const plans = installmentPlans(personal.counted, manual)
    const fixed = fixedPayments(personal.counted, items, plans, month, startDay, today)
    return budgetStatus(personal.counted, month, startDay, today, setup.monthlyKurus, setup.plan, fixed)
  }, [enabled, personal, setup, recurring, month, startDay])
}

/** Hatırlatma zamanı gelmiş ödemeler (önümüzdeki iki hafta içinde). */
export function useDuePayments(enabled = true): DuePayment[] {
  const personal = usePersonalTransactions()
  const recurring = useAllRecurring()
  return useMemo(() => {
    if (!enabled || !personal || !recurring) return []
    const manual = new Set(recurring.filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!))
    return upcomingPayments(recurring, installmentPlans(personal.counted, manual), todayIso(), 14).filter((d) => d.remind)
  }, [enabled, personal, recurring])
}

/** Düzenli ödemelerdeki taksitlerin kalan toplamı (ekstreden bulunan + elle eklenen). */
export function useInstallmentDebt(): number {
  const recurring = useRecurring()
  const personal = usePersonalTransactions()
  return useMemo(() => {
    if (!recurring || !personal) return 0
    const today = todayIso()
    const manual = recurring.filter((r) => r.kind === 'installment' && r.active)
    const keys = new Set(manual.map((r) => r.matchKey ?? ''))
    const fromStatements = installmentPlans(personal.counted, keys).reduce((s, p) => s + p.remainingKurus, 0)
    const fromManual = manual.reduce((s, r) => s + (progressOf(r, today).remaining ?? 0) * r.amountKurus, 0)
    return fromStatements + fromManual
  }, [recurring, personal])
}

const LIQUID = new Set(['deposit', 'cash', 'fx', 'gold', 'fund'])

/** Plus+ yolculuk için uygulamadaki veriler: ortalama gider, düzenli ödemeler, varlıklar, borçlar. */
export function useJourneyFacts(): JourneyFacts | null {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const recurring = useRecurring()
  const assets = useAssets()
  const categories = useCategories()
  const installmentDebt = useInstallmentDebt()
  return useMemo(() => {
    if (!personal || !recurring || !assets) return null
    const today = todayIso()
    const avg = averageMonthlyExpense(personal.counted, startDay, today)
    const recurringMonthly = recurring
      .filter((r) => r.active)
      .reduce((s, r) => s + (r.cadence === 'monthly' ? r.amountKurus : r.cadence === 'weekly' ? Math.round((r.amountKurus * 52) / 12) : Math.round(r.amountKurus / 12)), 0)
    const p = portfolio(assets, today, installmentDebt)
    let liquid = 0
    let recent = 0
    let consumer = 0
    // Aylık borç ödemeleri: girilen asgari/taksit (yoksa tahmini asgari) + bu ayki kart ve elle eklenen taksitler
    const manualKeys = new Set(recurring.filter((r) => r.kind === 'installment' && r.matchKey).map((r) => r.matchKey!))
    let payments = installmentPlans(personal.counted, manualKeys).reduce((s, x) => s + x.monthlyKurus, 0)
    for (const r of recurring) if (r.kind === 'installment' && r.active && (progressOf(r, today).remaining ?? 0) > 0) payments += r.amountKurus
    for (const a of assets) {
      if (a.archived || a.kind !== 'debt') continue
      const bal = holdingSummary(a, today).valueKurus
      if (bal <= 0) continue
      if (CONSUMER_DEBT.includes(debtTypeOf(a))) consumer += bal
      payments += debtMonthlyPayment(a, bal, today, estimatedMinPayment)
    }
    const since = addMonthsClamped(today, -3)
    for (const a of assets) {
      if (a.archived || a.kind === 'debt') continue
      if (LIQUID.has(a.kind)) liquid += holdingSummary(a, today).valueKurus
      for (const t of a.trades) if (t.date > since && t.date <= today) recent += (t.side === 'buy' ? 1 : -1) * t.quantity * t.unitPriceKurus
    }
    // Özgürlük Rotası v2: canlı borç listesi, düzenli ödemeler/taksitler (bitiş ayıyla) ve 6 gruba göre harcama
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]))
    const debtList: CoachDebt[] = []
    for (const a of assets) {
      if (a.archived || a.kind !== 'debt') continue
      const bal = holdingSummary(a, today).valueKurus
      if (bal <= 0) continue
      const rate = a.debtTerms?.monthlyRatePct ?? 0
      const plan = a.debtPlan?.mode === 'monthly'
      const min = plan ? a.debtPlan!.installmentKurus : a.debtTerms?.minPaymentKurus
      debtList.push({ id: a.id, name: a.name, balanceKurus: bal, monthlyRatePct: rate, minPaymentKurus: min || estimatedMinPayment(bal, rate), estimatedMin: !min, fixed: plan && rate === 0 })
    }
    const recurringList: RecurringLoad[] = []
    for (const r of recurring) {
      if (!r.active) continue
      const left = progressOf(r, today).remaining
      if (left === 0) continue
      const monthly = r.cadence === 'monthly' ? r.amountKurus : r.cadence === 'weekly' ? Math.round((r.amountKurus * 52) / 12) : Math.round(r.amountKurus / 12)
      const months = left === null ? null : r.cadence === 'monthly' ? left : r.cadence === 'weekly' ? Math.ceil((left * 12) / 52) : left * 12
      recurringList.push({ name: r.name, monthlyKurus: monthly, installment: r.kind === 'installment', remainingMonths: months, housing: spendGroupOf(r.categoryId, catName.get(r.categoryId ?? '') ?? '') === 'housing' })
    }
    for (const pl of installmentPlans(personal.counted, manualKeys)) if (pl.remaining > 0) recurringList.push({ name: pl.name, monthlyKurus: pl.monthlyKurus, installment: true, remainingMonths: pl.remaining })
    const fixedKeys = new Set(recurring.filter((r) => r.active && r.matchKey).map((r) => r.matchKey!))
    const avgs = flexibleCategoryAverages(personal.counted, startDay, today, fixedKeys)
    let spendingByGroup: SpendBreakdown | null = null
    if (avgs.length) {
      spendingByGroup = Object.fromEntries(SPEND_GROUPS.map((g) => [g, 0])) as SpendBreakdown
      for (const c of avgs) spendingByGroup[spendGroupOf(c.categoryId, catName.get(c.categoryId) ?? '')] += c.averageKurus
    }
    return {
      debtList,
      recurringList,
      spendingByGroup,
      averageExpenseKurus: avg?.averageKurus ?? null,
      expenseMonths: avg?.months ?? 0,
      recurringMonthlyKurus: recurringMonthly,
      liquidKurus: liquid,
      assetsKurus: p.assetsKurus,
      debtsKurus: p.debtsKurus,
      consumerDebtKurus: consumer,
      monthlyDebtPaymentKurus: payments,
      contributedKurus: p.contributedKurus,
      marketGainKurus: p.unrealizedKurus + p.realizedKurus,
      recentMonthlyContributionKurus: Math.round(recent / 3),
      hasAssets: assets.some((a) => a.kind !== 'debt' && !a.archived),
    }
  }, [personal, recurring, assets, categories, installmentDebt, startDay])
}
