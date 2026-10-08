import { useMemo } from 'react'
import { debtRecurring } from '../domain/assets'
import { todayIso } from '../domain/dates'
import { personalListView, personalView } from '../domain/personal'
import { plannedInstallments } from '../domain/recurring'
import type { RecurringPayment, Transaction } from '../domain/types'
import { useMembers } from './cloud'
import { useAssets, useGroups, useRecurring, useTransactions } from './data'
import { usePlan } from './plan'

/** Kayıtlı düzenli ödemeler ve taksitli borçlardan gelen taksit kalemleri birlikte. */
export function useAllRecurring(): RecurringPayment[] | undefined {
  const recurring = useRecurring()
  const assets = useAssets()
  return useMemo(() => (recurring && assets ? [...recurring, ...debtRecurring(assets)] : undefined), [recurring, assets])
}

/**
 * "Tümü" görünümü (src/domain/personal.ts): `counted` toplamlara girenler (kendi giderleriniz ve
 * paylaşım fark satırları), `list` bunlara ek olarak üyelerin ortak giderleri (yalnızca bilgi için).
 * Plus'ta ödeme günü gelmiş ama henüz ekstrede görülmemiş taksitler "planlı taksit" olarak eklenir.
 */
export function usePersonalTransactions(): { counted: Transaction[]; list: Transaction[] } | undefined {
  const all = useTransactions()
  const groups = useGroups()
  const items = useAllRecurring()
  const { selfId } = useMembers()
  const installments = usePlan().has('installments')
  return useMemo(() => {
    if (!all || !groups) return undefined
    const counted = personalView(all, groups, selfId)
    const list = personalListView(all, groups, selfId)
    if (!installments || !items) return { counted, list }
    const planned = plannedInstallments(counted, items, todayIso())
    if (!planned.length) return { counted, list }
    const byDate = (a: Transaction, b: Transaction) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))
    return {
      counted: [...counted, ...planned].sort(byDate),
      list: [...list, ...planned].sort(byDate),
    }
  }, [all, groups, selfId, items, installments])
}
