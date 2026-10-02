import { useMemo } from 'react'
import { personalView } from '../domain/personal'
import type { Transaction } from '../domain/types'
import { useMembers } from './cloud'
import { useGroups, useTransactions } from './data'

/**
 * "Tümü" görünümünün işlemleri: kendi eklediğiniz giderler; paylaştırılan dönemlerde ortak grubun
 * giderleri yerine size düşen pay (src/domain/personal.ts).
 */
export function usePersonalTransactions(): Transaction[] | undefined {
  const all = useTransactions()
  const groups = useGroups()
  const { selfId } = useMembers()
  return useMemo(() => (all && groups ? personalView(all, groups, selfId) : undefined), [all, groups, selfId])
}
