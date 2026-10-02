import { useEffect, useRef } from 'react'
import { currentPeriod, normalizeStartDay } from '../domain/dates'
import type { SpendGroup } from '../domain/types'
import { useGroupMap, useSettings } from './data'
import { useUi } from './ui'

/** Kişisel ay döngüsünün başlangıç günü (Ayarlar). */
export function usePersonalCycle(): number {
  return normalizeStartDay(useSettings()?.cycleStartDay)
}

/**
 * Ekranda geçerli ay döngüsü: seçili grubun kendi döngüsü varsa o, yoksa kişisel ayar. Paylaşılan
 * grubun dönemi her zaman yöneticinin belirlediği dönemdir (belirlenmediyse takvim ayı); böylece
 * bütün üyeler aynı dönemi görür ve paylaşım aynı döneme yapılır.
 */
export function useCycle(): { startDay: number; groupName: string | null } {
  const personal = usePersonalCycle()
  const groups = useGroupMap()
  const { groupFilter } = useUi()
  const g = groupFilter && groupFilter !== 'none' ? groups.get(groupFilter) : undefined
  if (g?.cloudId) return { startDay: groupCycleDay(g), groupName: g.name }
  return g?.cycleStartDay ? { startDay: normalizeStartDay(g.cycleStartDay), groupName: g.name } : { startDay: personal, groupName: null }
}

/** Paylaşılan grubun dönem başlangıç günü (yöneticinin ayarı; yoksa ayın 1'i). */
export function groupCycleDay(g: Pick<SpendGroup, 'cycleStartDay'>): number {
  return normalizeStartDay(g.cycleStartDay ?? 1)
}

/** Döngü değişince, içinde bulunulan dönem seçiliyse yeni döngünün içinde bulunulan dönemine geçer. */
export function useFollowCurrentPeriod() {
  const { startDay } = useCycle()
  const { month, setMonth } = useUi()
  const prev = useRef(1)
  useEffect(() => {
    if (prev.current === startDay) return
    if (month === currentPeriod(prev.current)) setMonth(currentPeriod(startDay))
    prev.current = startDay
  }, [startDay, month, setMonth])
}
