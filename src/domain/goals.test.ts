import { describe, expect, it } from 'vitest'
import { goalProgress, type SavingsGoal } from './goals'

const goal = (target: number, targetDate: string | null, contributions: [string, number][]): SavingsGoal => ({
  id: 'g',
  name: 'Tatil',
  icon: 'Plane',
  color: '#000',
  targetKurus: target * 100,
  targetDate,
  contributions: contributions.map(([date, lira], i) => ({ id: String(i), date, amountKurus: lira * 100 })),
  archived: false,
  createdAt: '',
  updatedAt: '',
})

describe('birikim hedefi ilerlemesi', () => {
  it('kalan tutarı ve aylık gereken tutarı hesaplar', () => {
    const p = goalProgress(goal(12000, '2027-03-31', [['2026-08-10', 1000], ['2026-09-10', 1000], ['2026-10-01', 1000]]), '2026-10-06')
    expect(p.savedKurus).toBe(300000)
    expect(p.remainingKurus).toBe(900000)
    expect(p.ratio).toBeCloseTo(0.25)
    // Ekim–Mart: 6 ay
    expect(p.monthsLeft).toBe(6)
    expect(p.monthlyNeededKurus).toBe(150000)
    expect(p.monthlyAverageKurus).toBe(100000)
    expect(p.status).toBe('behind')
    expect(p.projectedMonth).toBe('2027-06')
  })
  it('tempo yeterliyse yolunda sayar; tarihsiz ve tamamlanmış hedefler', () => {
    expect(goalProgress(goal(6000, '2027-09-30', [['2026-08-10', 1000], ['2026-09-10', 1000], ['2026-10-01', 1000]]), '2026-10-06').status).toBe('on-track')
    expect(goalProgress(goal(6000, null, [['2026-10-01', 1000]]), '2026-10-06').status).toBe('no-date')
    const done = goalProgress(goal(1000, '2026-12-31', [['2026-10-01', 1200]]), '2026-10-06')
    expect(done.status).toBe('done')
    expect(done.remainingKurus).toBe(0)
    expect(goalProgress(goal(1000, '2026-09-30', [['2026-09-01', 100]]), '2026-10-06').status).toBe('overdue')
  })
  it('yeni başlayan hedefte ortalamayı geçen süreye böler', () => {
    const p = goalProgress(goal(10000, null, [['2026-10-01', 2000]]), '2026-10-06')
    expect(p.monthlyAverageKurus).toBe(200000)
    expect(p.projectedMonth).toBe('2027-01')
  })
})
