import { describe, expect, it } from 'vitest'
import { budgetStatus, DEFAULT_BUDGET_PLAN, weekStart } from './budget'
import { normalizeText } from './normalize'
import { hasFeature, planIncludes } from './plans'
import type { Transaction } from './types'

let seq = 0
const tx = (date: string, lira: number, type: Transaction['type'] = 'expense', categoryId: string | null = 'market'): Transaction => ({
  id: String(++seq),
  date,
  amountKurus: Math.round(lira * 100),
  type,
  description: 'X',
  normalizedDescription: normalizeText('X'),
  categoryId,
  source: 'manual',
  createdAt: '',
  updatedAt: '',
})

describe('paketler', () => {
  it('üst paket alttakini kapsar', () => {
    expect(planIncludes('plusplus', 'plus')).toBe(true)
    expect(planIncludes('plus', 'plusplus')).toBe(false)
    expect(hasFeature('free', 'advancedBudget')).toBe(false)
    expect(hasFeature('plus', 'advancedBudget')).toBe(true)
    expect(hasFeature('plus', 'aiCoach')).toBe(false)
    expect(hasFeature('plusplus', 'aiCoach')).toBe(true)
  })
})

describe('bütçe durumu', () => {
  const plan = { ...DEFAULT_BUDGET_PLAN, categoryLimits: { market: 100000, restoran: 50000 } }
  const data = [
    tx('2026-09-02', 600, 'expense', 'market'),
    tx('2026-09-03', 100, 'refund', 'market'),
    tx('2026-09-04', 450, 'expense', 'restoran'),
    tx('2026-09-05', 9999, 'transfer', null),
    tx('2026-09-06', 300, 'expense', 'market'),
    tx('2026-08-10', 700, 'expense', 'market'),
  ]

  it('kategori limitlerini net gidere göre ölçer ve uyarır', () => {
    const s = budgetStatus(data, '2026-09', 1, '2026-09-30', null, plan)
    const market = s.categories.find((c) => c.categoryId === 'market')!
    expect(market.spentKurus).toBe(80000)
    expect(market.state).toBe('near')
    const restoran = s.categories.find((c) => c.categoryId === 'restoran')!
    expect(restoran.state).toBe('near')
    expect(s.warnings.map((w) => w.categoryId)).toEqual(['restoran', 'market'])
    expect(s.forecast?.projectedKurus).toBe(125000) // 1250 TL, 30 günün 30'unda
  })

  it('aşılan limit önce gelir', () => {
    const s = budgetStatus([...data, tx('2026-09-07', 300, 'expense', 'market')], '2026-09', 1, '2026-10-02', null, plan)
    expect(s.warnings[0]).toMatchObject({ categoryId: 'market', status: { state: 'over' } })
    expect(s.forecast).toBeNull() // geçmiş dönem için tahmin yok
  })

  it('devir yalnızca önceki dönemden ve kayıt varsa gelir', () => {
    const withCarry = { ...plan, carryover: true }
    const s = budgetStatus(data, '2026-09', 1, '2026-09-15', 200000, withCarry)
    // Ağustos: market 700 TL harcandı, limit 1000 → 300 TL devreder; toplam 2000 − 700 = 1300 TL
    expect(s.categories.find((c) => c.categoryId === 'market')!.carryKurus).toBe(30000)
    expect(s.total?.carryKurus).toBe(130000)
    // Temmuzda kayıt yok: Ağustos'a devir yok
    const aug = budgetStatus(data, '2026-08', 1, '2026-09-15', 200000, withCarry)
    expect(aug.total?.carryKurus).toBe(0)
  })

  it('haftalık bütçe Pazartesi–Pazar haftasını sayar', () => {
    expect(weekStart('2026-09-06')).toBe('2026-08-31') // Pazar
    expect(weekStart('2026-09-07')).toBe('2026-09-07') // Pazartesi
    const s = budgetStatus(data, '2026-09', 1, '2026-09-06', null, { ...plan, weeklyKurus: 100000 })
    expect(s.week).toMatchObject({ start: '2026-08-31', end: '2026-09-06', spentKurus: 125000, state: 'over' })
  })

  it('tahmin günlük ortalamayla dönem sonunu hesaplar', () => {
    const s = budgetStatus(data, '2026-09', 1, '2026-09-10', 150000, plan)
    expect(s.forecast).toMatchObject({ elapsedDays: 10, totalDays: 30, spentKurus: 125000, projectedKurus: 375000, vsBudgetKurus: 225000 })
  })
})
