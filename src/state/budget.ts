import { useMemo } from 'react'
import { budgetStatus, DEFAULT_BUDGET_PLAN, type BudgetStatus } from '../domain/budget'
import { todayIso } from '../domain/dates'
import { fixedPayments, installmentPlans, upcomingPayments, type DuePayment } from '../domain/recurring'
import { usePersonalCycle } from './cycle'
import { useRecurring, useSettings } from './data'
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
