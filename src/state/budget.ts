import { useMemo } from 'react'
import { flexibleCategoryAverages, type AutoBudget, type BudgetMode } from '../domain/autoBudget'
import { budgetStatus, DEFAULT_BUDGET_PLAN, type BudgetPlan, type BudgetStatus } from '../domain/budget'
import { budgetFacts, READ_LOCKED_DATA, type FactsGates } from '../domain/budgetFacts'
import { buildBucketBudget, fixedSpendSplit, toAutoBudget } from '../domain/bucketBudget'
import { periodOf, todayIso } from '../domain/dates'
import { buildMoneyFlow, fixedShares, flowSpent, personalShares, type MoneyFlowResult } from '../domain/moneyFlow'
import { addMonthsClamped, fixedPayments, installmentPlans, progressOf, upcomingPayments, type DuePayment } from '../domain/recurring'
import { CONSUMER_DEBT, debtMonthlyPayment, debtTypeOf, holdingSummary, portfolio } from '../domain/assets'
import { estimatedMinPayment } from '../domain/coach'
import { averageMonthlyExpense, SPEND_GROUPS, spendGroupOf, type JourneyFacts, type RecurringLoad, type SpendBreakdown } from '../domain/journey'
import type { CoachDebt } from '../domain/coach'
import { applySetup } from '../domain/routeSetup'
import { usePersonalCycle } from './cycle'
import { useAssets, useCategories, useCategoryMap, useGoals, useRecurring, useSettings } from './data'
import { useAllRecurring, usePersonalTransactions } from './personal'
import { usePlan } from './plan'

/**
 * Koçun otomatik bütçesi: gelire göre dört kova (zorunlu sabitler, ihtiyaçlar, istekler, birikim ve
 * borç kapatma). Her pakette hesaplanır; girilmiş ödeme, borç ve varlık verisi her pakette okunur
 * (READ_LOCKED_DATA). Hedefler Plus'ta, Yolculuk testi Plus+'ta, kategori limitleri ve haftalık
 * bütçe Plus'ta girer. Cihazda, kural tabanlı.
 */
export function useAutoBudget(): AutoBudget | null | undefined {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const settings = useSettings()
  // debt:* kalemleri okunmaz: taksitli borç varlıktan bir kez sayılır
  const recurring = useRecurring()
  const assets = useAssets()
  const goals = useGoals()
  const categories = useCategories()
  const { has } = usePlan()
  return useMemo(() => {
    if (!personal || !settings || !recurring || !assets || !goals || !categories) return undefined
    const gates: FactsGates = {
      recurring: READ_LOCKED_DATA || has('subscriptions'),
      assets: READ_LOCKED_DATA || has('assets'),
      installments: READ_LOCKED_DATA || has('installments'),
      goals: has('goals'),
      journey: has('journey'),
      detail: has('advancedBudget'),
    }
    const facts = budgetFacts({ txs: personal.counted, settings, recurring, assets, goals, categories, startDay, today: todayIso(), gates })
    const buckets = facts && buildBucketBudget(facts)
    if (!facts || !buckets) return null
    const { recurringKurus, debtKurus } = fixedSpendSplit(facts.fixed)
    return toAutoBudget(buckets, facts.income.source, facts.goalsKurus, recurringKurus, debtKurus)
  }, [personal, settings, recurring, assets, goals, categories, has, startDay])
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

/**
 * Aylık paranın yolu: gelirin dört kovaya hedef dağılımı ve dönemde harcanan. Hedefler her pakette
 * Bütçe sayfasındaki dört kovalı motordan; motor kurulamazsa sabit 50/30/20. incomeKurus verilmezse motorun geliri.
 */
export function useMoneyFlow(opts: { month?: string; incomeKurus?: number } = {}): MoneyFlowResult | null {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const categories = useCategoryMap()
  const recurring = useAllRecurring()
  const auto = useAutoBudget()
    const { month, incomeKurus } = opts
  return useMemo(() => {
    if (!personal || auto === undefined) return null
    const income = incomeKurus ?? auto?.incomeKurus ?? 0
    if (income <= 0) return null
    const keys = new Set((recurring ?? []).filter((r) => r.kind === 'installment').map((r) => r.matchKey ?? '').filter(Boolean))
    const spent = flowSpent(personal.counted, month ?? periodOf(todayIso(), startDay), startDay, categories, keys)
    const mine = auto ? personalShares(auto) : null
    const hasDebt = spent.debt > 0 || (auto?.debtKurus ?? 0) > 0
    return buildMoneyFlow(income, mine ?? fixedShares(hasDebt), spent, !!mine)
  }, [personal, auto, recurring, categories, month, incomeKurus, startDay])
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
/** withSetup false: rota kurulumunun ilk rakamları eklenmeden, yalnızca uygulamadaki kayıtlar. */
export function useJourneyFacts({ withSetup = true }: { withSetup?: boolean } = {}): JourneyFacts | null {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const recurring = useRecurring()
  const assets = useAssets()
  const categories = useCategories()
  const installmentDebt = useInstallmentDebt()
  const saved = useSettings()?.journey?.setup
  const setup = withSetup ? saved : undefined
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
    const facts: JourneyFacts = {
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
    // Rota kurulumundaki ilk rakamlar, uygulamada karşılığı olmayan alanları doldurur
    return applySetup(facts, setup)
  }, [personal, recurring, assets, categories, installmentDebt, startDay, setup])
}
