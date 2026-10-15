import { useMemo } from 'react'
import { debtRecurring } from '../domain/assets'
import { dayOf, todayIso } from '../domain/dates'
import { attributeEarlySalary, personalCycleDay, primarySalary } from '../domain/income'
import { personalListView, personalView } from '../domain/personal'
import { plannedIncomes, plannedInstallments } from '../domain/recurring'
import { applyPlannedGroups, type IsoDate, type RecurringIncome, type RecurringPayment, type Transaction } from '../domain/types'
import { useMembers } from './cloud'
import { useAssets, useGroups, useRecurring, useSettings, useTransactions } from './data'
import { usePlan } from './plan'

/** Maaş gününe denk gelen döngü günü (29–31 → 28); maaş yoksa null. */
const salaryCycleDay = (s: RecurringIncome | null) => (s ? Math.min(28, dayOf(s.startDate)) : null)

/** Kayıtlı düzenli ödemeler ve taksitli borçlardan gelen taksit kalemleri birlikte. */
export function useAllRecurring(): RecurringPayment[] | undefined {
  const recurring = useRecurring()
  const assets = useAssets()
  return useMemo(() => (recurring && assets ? [...recurring, ...debtRecurring(assets)] : undefined), [recurring, assets])
}

const NO_MOVES: ReadonlyMap<string, IsoDate> = new Map()

/**
 * "Tümü" görünümü (src/domain/personal.ts): `counted` toplamlara girenler (kendi giderleriniz ve
 * paylaşım fark satırları), `list` bunlara ek olarak üyelerin ortak giderleri (yalnızca bilgi için).
 * Plus'ta ödeme günü gelmiş ama henüz ekstrede görülmemiş taksitler "planlı taksit", günü gelmiş
 * düzenli gelirler (her pakette) "planlı gelir" olarak eklenir. Ay döngüsü maaş gününe bağlıysa hafta
 * sonu yüzünden erken yatan maaş `counted`ta maaş gününe taşınır (`list` değişmez); `moved`: işlem
 * kimliği → sayıldığı gün.
 */
export function usePersonalTransactions(): { counted: Transaction[]; list: Transaction[]; moved: ReadonlyMap<string, IsoDate> } | undefined {
  const all = useTransactions()
  const groups = useGroups()
  const items = useAllRecurring()
  const { selfId } = useMembers()
  const installments = usePlan().has('installments')
  const settings = useSettings()
  const incomes = settings?.recurringIncomes
  const plannedGroups = settings?.plannedGroups
  // Ay döngüsü maaş gününde başlıyorsa (maaşa bağlı ya da elle aynı gün seçilmiş) erken yatan maaş yeni aya yazılır
  const salaryCycle = !!settings && personalCycleDay(settings) === salaryCycleDay(primarySalary(settings.recurringIncomes))
  return useMemo(() => {
    if (!all || !groups) return undefined
    const own = personalView(all, groups, selfId)
    const list = personalListView(all, groups, selfId)
    const today = todayIso()
    const planned = applyPlannedGroups([...(installments && items ? plannedInstallments(own, items, today) : []), ...(incomes?.length ? plannedIncomes(own, incomes, today) : [])], plannedGroups)
    const byDate = (a: Transaction, b: Transaction) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))
    let counted = planned.length ? [...own, ...planned].sort(byDate) : own
    let moved = NO_MOVES
    const salary = salaryCycle ? primarySalary(incomes) : null
    if (salary) {
      const r = attributeEarlySalary(counted, salary, today)
      if (r.moved.size) {
        counted = r.txs.sort(byDate)
        moved = r.moved
      }
    }
    return { counted, list: planned.length ? [...list, ...planned].sort(byDate) : list, moved }
  }, [all, groups, selfId, items, installments, incomes, plannedGroups, salaryCycle])
}
