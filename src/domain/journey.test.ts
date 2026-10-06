import { describe, expect, it } from 'vitest'
import { averageMonthlyExpense, buildJourney, monthsToTarget, projectScenario, targetCapital, type JourneyFacts, type JourneyProfile } from './journey'
import { normalizeText } from './normalize'
import type { Transaction } from './types'

const profile = (o: Partial<JourneyProfile> = {}): JourneyProfile => ({
  goal: 'independence',
  horizonYears: 20,
  targetMonthlyExpenseKurus: 4000000,
  monthlyIncomeKurus: 6000000,
  essentialMonthlyKurus: 3000000,
  incomeStability: 'regular',
  priorities: [],
  withdrawalRatePct: 4,
  celebrated: [],
  confirmedAt: '',
  ...o,
})
const facts = (o: Partial<JourneyFacts> = {}): JourneyFacts => ({
  averageExpenseKurus: 4500000,
  expenseMonths: 3,
  recurringMonthlyKurus: 0,
  liquidKurus: 6000000,
  assetsKurus: 20000000,
  debtsKurus: 2000000,
  contributedKurus: 18000000,
  marketGainKurus: 2000000,
  recentMonthlyContributionKurus: 1000000,
  hasAssets: true,
  ...o,
})

describe('finansal özgürlük yolculuğu', () => {
  it('hedef sermaye yıllık gider ÷ çekim oranıdır', () => {
    expect(targetCapital({ targetMonthlyExpenseKurus: 4000000, withdrawalRatePct: 4 })).toBe(1200000000)
  })
  it('aşamaları ve göstergeleri gerçek verilerden hesaplar', () => {
    const j = buildJourney(profile(), facts())
    const by = Object.fromEntries(j.stages.map((s) => [s.id, s]))
    expect(by.balance.done).toBe(true)
    // 60.000 likit / (3 × 30.000) = 2/3
    expect(by.emergency.done).toBe(false)
    expect(by.emergency.progress).toBeCloseTo(2 / 3)
    expect(by.debt.done).toBe(true)
    // birikim oranı 15.000 / 60.000 = %25
    expect(by.saving.done).toBe(true)
    expect(j.indicators.securityMonths).toBe(2)
    expect(j.indicators.progressKurus).toBe(18000000)
    expect(j.indicators.monthlySavingKurus).toBe(1500000)
    // rota: ilk aşama tamam, ikincide 2/3
    expect(j.position).toBeCloseTo(1 + 2 / 3)
    // olumlu senaryo temkinliden önce biter
    expect(j.indicators.route.optimistic!).toBeLessThan(j.indicators.route.cautious!)
  })
  it('gider gelirden fazlaysa denge aşaması açık kalır ve rota ulaşılamaz olur', () => {
    const j = buildJourney(profile({ monthlyIncomeKurus: 4000000 }), facts({ assetsKurus: 0, debtsKurus: 0, liquidKurus: 0 }))
    expect(j.stages[0].done).toBe(false)
    expect(j.stages[0].next).toContain('azaltmak')
    expect(j.indicators.route.cautious).toBeNull()
  })
  it('hedefe kalan ayları hesaplar', () => {
    expect(monthsToTarget(0, 100, 1200, 0)).toBe(12)
    expect(monthsToTarget(2000, 0, 1000, 0)).toBe(0)
    expect(monthsToTarget(0, 0, 1000, 0)).toBeNull()
    expect(monthsToTarget(0, 100, 12000, 10)!).toBeLessThan(120)
  })
  it('ortalama aylık gideri son tamamlanmış dönemlerden alır', () => {
    let n = 0
    const tx = (date: string, lira: number, type: Transaction['type'] = 'expense'): Transaction => ({ id: String(++n), date, amountKurus: lira * 100, type, description: 'x', normalizedDescription: normalizeText('x'), categoryId: null, source: 'manual', createdAt: '', updatedAt: '' })
    const r = averageMonthlyExpense([tx('2026-08-10', 1000), tx('2026-09-10', 3000), tx('2026-09-11', 1000, 'refund'), tx('2026-10-02', 9999)], 1, '2026-10-06')
    expect(r).toEqual({ averageKurus: 150000, months: 2 })
    expect(averageMonthlyExpense([], 1, '2026-10-06')).toBeNull()
  })
})

describe('senaryolar', () => {
  const base = { startKurus: 100000, monthlySavingKurus: 10000, years: 2, inflationPct: 20, extraSavingKurus: 0, incomeLossMonths: 0, incomeLossMonthlySpendKurus: 0, bigExpenseKurus: 0, bigExpenseYear: 1 }
  it('getiri olmadan birikimleri toplar; nominal değer enflasyonla büyür', () => {
    const p = projectScenario(base, 0)
    expect(p.map((x) => x.realKurus)).toEqual([100000, 220000, 340000])
    expect(p[1].nominalKurus).toBe(264000)
  })
  it('gelir kaybı ve büyük harcama birikimi azaltır', () => {
    const p = projectScenario({ ...base, incomeLossMonths: 3, incomeLossMonthlySpendKurus: 20000, bigExpenseKurus: 50000, bigExpenseYear: 1 }, 0)
    // 100.000 − 50.000 − 3×20.000 + 9×10.000
    expect(p[1].realKurus).toBe(80000)
  })
})
