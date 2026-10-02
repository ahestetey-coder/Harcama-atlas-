import { useMemo } from 'react'
import { personalListView, personalView } from '../domain/personal'
import type { Transaction } from '../domain/types'
import { useMembers } from './cloud'
import { useGroups, useTransactions } from './data'

/**
 * "Tümü" görünümü (src/domain/personal.ts): `counted` toplamlara girenler (kendi giderleriniz ve
 * paylaşım fark satırları), `list` bunlara ek olarak üyelerin ortak giderleri (yalnızca bilgi için).
 */
export function usePersonalTransactions(): { counted: Transaction[]; list: Transaction[] } | undefined {
  const all = useTransactions()
  const groups = useGroups()
  const { selfId } = useMembers()
  return useMemo(
    () => (all && groups ? { counted: personalView(all, groups, selfId), list: personalListView(all, groups, selfId) } : undefined),
    [all, groups, selfId],
  )
}
