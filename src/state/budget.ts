import { useMemo } from 'react'
import { budgetStatus, DEFAULT_BUDGET_PLAN, type BudgetStatus } from '../domain/budget'
import { todayIso } from '../domain/dates'
import { addMonthsClamped, fixedPayments, installmentPlans, progressOf, upcomingPayments, type DuePayment } from '../domain/recurring'
import { CONSUMER_DEBT, debtTypeOf, holdingSummary, portfolio } from '../domain/assets'
import { estimatedMinPayment } from '../domain/coach'
import { averageMonthlyExpense, type JourneyFacts } from '../domain/journey'
import { usePersonalCycle } from './cycle'
import { useAssets, useRecurring, useSettings } from './data'
import { usePersonalTransactions } from './personal'

/** Kişisel (Tümü) bütçe durumu; düzenli ödemeler ve taksitler ay sonu tahminine katılır. */
export function useBudgetStatus(month: string, enabled = true): BudgetStatus | null {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const settings = useSettings()
  const recurring = useRecurring()
  return useMemo(() => {
    if (!enabled || !personal || !settings) return null
    const today = todayIso()
    const items = recurring ?? []
    const manual = new Set(items.filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!))
    const plans = installmentPlans(personal.counted, manual)
    const fixed = fixedPayments(personal.counted, items, plans, month, startDay, today)
    return budgetStatus(personal.counted, month, startDay, today, settings.monthlyBudgetKurus, settings.budgetPlan ?? DEFAULT_BUDGET_PLAN, fixed)
  }, [enabled, personal, settings, recurring, month, startDay])
}

/** Hatırlatma zamanı gelmiş ödemeler (önümüzdeki iki hafta içinde). */
export function useDuePayments(enabled = true): DuePayment[] {
  const personal = usePersonalTransactions()
  const recurring = useRecurring()
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
      payments += Math.min(bal, a.debtTerms?.minPaymentKurus ?? estimatedMinPayment(bal, a.debtTerms?.monthlyRatePct ?? 0))
    }
    const since = addMonthsClamped(today, -3)
    for (const a of assets) {
      if (a.archived || a.kind === 'debt') continue
      if (LIQUID.has(a.kind)) liquid += holdingSummary(a, today).valueKurus
      for (const t of a.trades) if (t.date > since && t.date <= today) recent += (t.side === 'buy' ? 1 : -1) * t.quantity * t.unitPriceKurus
    }
    return {
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
  }, [personal, recurring, assets, installmentDebt, startDay])
}
