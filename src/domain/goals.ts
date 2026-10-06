import { monthOf } from './dates'
import type { IsoDate } from './types'
import { addMonthsClamped } from './recurring'

export interface GoalContribution {
  id: string
  date: IsoDate
  /** Pozitif: birikime ekleme, negatif: çekme. */
  amountKurus: number
}

/** Plus: birikim hedefi (tatil, araç, acil durum…). */
export interface SavingsGoal {
  id: string
  name: string
  icon: string
  color: string
  targetKurus: number
  targetDate: IsoDate | null
  contributions: GoalContribution[]
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface GoalProgress {
  savedKurus: number
  remainingKurus: number
  ratio: number
  /** Hedef tarihe kadar kalan ay (bu ay dahil); tarih yoksa null. */
  monthsLeft: number | null
  /** Hedefe tarihinde ulaşmak için ayda ayrılması gereken tutar. */
  monthlyNeededKurus: number | null
  /** Son 3 ayın aylık ortalama birikimi. */
  monthlyAverageKurus: number
  status: 'done' | 'on-track' | 'behind' | 'no-date' | 'overdue'
  /** Bu tempoyla tahmini tamamlanma ayı (YYYY-AA). */
  projectedMonth: string | null
}

export function goalProgress(goal: SavingsGoal, today: IsoDate): GoalProgress {
  const saved = goal.contributions.reduce((s, c) => s + c.amountKurus, 0)
  const remaining = Math.max(0, goal.targetKurus - saved)
  const ratio = goal.targetKurus > 0 ? Math.max(0, saved / goal.targetKurus) : 0
  // Son 3 takvim ayı (bu ay dahil); hedef daha yeni başladıysa geçen ay sayısına bölünür
  const cur = monthOf(today)
  const monthIndex = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    return y * 12 + mo
  }
  const window = new Set([0, 1, 2].map((i) => monthOf(addMonthsClamped(today, -i))))
  const recent = goal.contributions.filter((c) => c.date <= today && window.has(monthOf(c.date))).reduce((s, c) => s + c.amountKurus, 0)
  const first = goal.contributions.reduce<IsoDate | null>((m, c) => (!m || c.date < m ? c.date : m), null)
  const span = first ? Math.min(3, Math.max(1, monthIndex(cur) - monthIndex(monthOf(first)) + 1)) : 3
  const avg = Math.max(0, Math.round(recent / span))
  let monthsLeft: number | null = null
  let monthlyNeeded: number | null = null
  if (goal.targetDate) {
    const [ty, tm] = monthOf(goal.targetDate).split('-').map(Number)
    const [cy, cm] = monthOf(today).split('-').map(Number)
    monthsLeft = Math.max(0, (ty - cy) * 12 + (tm - cm) + 1)
    monthlyNeeded = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining
  }
  let projectedMonth: string | null = null
  if (remaining === 0) projectedMonth = monthOf(today)
  else if (avg > 0) projectedMonth = monthOf(addMonthsClamped(today, Math.ceil(remaining / avg) - 1))
  const status: GoalProgress['status'] =
    remaining === 0
      ? 'done'
      : goal.targetDate && goal.targetDate < today
        ? 'overdue'
        : monthlyNeeded === null
          ? 'no-date'
          : avg >= monthlyNeeded
            ? 'on-track'
            : 'behind'
  return { savedKurus: saved, remainingKurus: remaining, ratio, monthsLeft, monthlyNeededKurus: monthlyNeeded, monthlyAverageKurus: avg, status, projectedMonth }
}
