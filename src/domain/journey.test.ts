import { describe, expect, it } from 'vitest'
import { averageMonthlyExpense, buildJourney, durationLabel, emergencyMonthsFor, formatInBase, indexFactor, monthsToTarget, projectScenario, rebase, simulatePlan, targetCapital, testsLeft, type JourneyFacts, type JourneyProfile } from './journey'
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
  it('uzman ölçütlerine göre sekiz seviyeyi gerçek verilerden hesaplar', () => {
    const j = buildJourney(profile(), facts({ consumerDebtKurus: 0, monthlyDebtPaymentKurus: 500000 }))
    const by = Object.fromEntries(j.stages.map((s) => [s.id, s]))
    expect(j.stages.map((s) => s.id)).toEqual(['balance', 'starter', 'debt', 'emergency', 'saving', 'security', 'independence', 'freedom'])
    expect(by.balance.done).toBe(true)
    // 60.000 likit ≥ 1 aylık zorunlu gider (30.000)
    expect(by.starter.done).toBe(true)
    // tüketici borcu yok, borç ödemesi gelirin %8'i
    expect(by.debt.done).toBe(true)
    // 60.000 / (3 × 30.000) = 2/3
    expect(by.emergency.done).toBe(false)
    expect(by.emergency.progress).toBeCloseTo(2 / 3)
    // birikim oranı 15.000 / 60.000 = %25 ≥ %20
    expect(by.saving.done).toBe(true)
    // güvence sermayesi: 30.000 × 12 / %4 = 9.000.000
    expect(j.indicators.securityCapitalKurus).toBe(900000000)
    expect(j.indicators.securityMonths).toBe(2)
    expect(j.indicators.progressKurus).toBe(18000000)
    expect(j.indicators.monthlySavingKurus).toBe(1500000)
    expect(j.position).toBeCloseTo(3 + 2 / 3)
    expect(j.level).toBe(3)
    expect(j.current?.id).toBe('emergency')
    expect(j.indicators.route.optimistic!).toBeLessThan(j.indicators.route.cautious!)
  })
  it('tüketici borcu ya da yüksek borç/gelir oranı borç aşamasını açık bırakır', () => {
    expect(buildJourney(profile(), facts({ consumerDebtKurus: 100000 })).stages[2].done).toBe(false)
    expect(buildJourney(profile(), facts({ consumerDebtKurus: 0, monthlyDebtPaymentKurus: 3000000 })).stages[2].done).toBe(false)
  })
  it('düzensiz gelirde ve bakmakla yükümlü kişi varken acil fon daha uzun', () => {
    expect(emergencyMonthsFor({ incomeStability: 'regular' })).toBe(3)
    expect(emergencyMonthsFor({ incomeStability: 'regular', dependents: 2 })).toBe(6)
    expect(emergencyMonthsFor({ incomeStability: 'irregular' })).toBe(9)
  })
  it('pasif gelir gereken sermayeyi azaltır', () => {
    expect(targetCapital({ targetMonthlyExpenseKurus: 4000000, withdrawalRatePct: 4, passiveIncomeKurus: 1000000 })).toBe(900000000)
  })
  it('USD ya da altın bazlı planda hedefin TL karşılığı kurla artar; birim değişince bugünkü TL korunur', () => {
    const p = profile({ base: 'USD', baseRateTl: 40 })
    expect(indexFactor(p, { USD: 50 })).toBeCloseTo(1.25)
    expect(indexFactor(p, {})).toBe(1)
    const j = buildJourney(p, facts(), { USD: 50 })
    expect(j.indicators.securityCapitalKurus).toBe(Math.round((3000000 * 1.25 * 12) / 0.04))
    const g = rebase(p, 'XAU', { USD: 50, XAU: 5000 })!
    expect(g.base).toBe('XAU')
    expect(g.baseRateTl).toBe(5000)
    expect(g.essentialMonthlyKurus).toBe(3750000)
    expect(rebase(p, 'XAU', { USD: 50 })).toBeNull()
    expect(formatInBase(500000, 'XAU', { XAU: 5000 })).toBe('1 gr altın')
    expect(formatInBase(500000, 'USD', { USD: 50 })).toBe('100 $')
  })
  it('test ayda iki kez yapılabilir', () => {
    expect(testsLeft(null, '2026-10-08')).toBe(2)
    expect(testsLeft({ tests: ['2026-09-30', '2026-10-01'] }, '2026-10-08')).toBe(1)
    expect(testsLeft({ tests: ['2026-10-01', '2026-10-05'] }, '2026-10-08')).toBe(0)
    expect(testsLeft({ tests: ['2026-10-01', '2026-10-05'] }, '2026-11-01')).toBe(2)
  })
  it('gider gelirden fazlaysa denge aşaması açık kalır ve rota ulaşılamaz olur', () => {
    const j = buildJourney(profile({ monthlyIncomeKurus: 4000000 }), facts({ assetsKurus: 0, debtsKurus: 0, liquidKurus: 0 }))
    expect(j.stages[0].done).toBe(false)
    expect(j.stages[0].next).toContain('azaltmak')
    expect(j.indicators.route.cautious).toBeNull()
  })
  it('her aşamanın hedefi ve kalan koşulları süresiyle birlikte hesaplanır', () => {
    const j = buildJourney(profile(), facts({ consumerDebtKurus: 600000, monthlyDebtPaymentKurus: 0 }))
    const debt = j.stages.find((s) => s.id === 'debt')!
    expect(debt.goal).toContain('Yüksek faizli borç kalmasın')
    expect(debt.conditions).toHaveLength(2)
    expect(debt.conditions[0]).toMatchObject({ done: false, left: 600000 })
    expect(debt.conditions[1].done).toBe(true)
    const saving = j.indicators.monthlySavingKurus
    expect(debt.etaMonths).toBe(Math.ceil(600000 / saving))
    const em = j.stages.find((s) => s.id === 'emergency')!
    const c = em.conditions[0]
    expect(c.left).toBe(c.target - c.now)
    expect(c.etaMonths).toBe(c.left > 0 ? Math.ceil(c.left / saving) : undefined)
    const freedom = j.stages.at(-1)!
    expect(freedom.conditions[0].target).toBe(j.indicators.goalKurus)
    expect(freedom.etaMonths).toBe(j.indicators.route.mid)
  })
  it('senaryo hesabı ve yolculuk tahmini aynı sonucu verir; süre grafik ufkundan bağımsızdır', () => {
    const input = { startKurus: 100000, monthlySavingKurus: 10000, years: 1, inflationPct: 0, extraSavingKurus: 0, incomeLossMonths: 0, incomeLossMonthlySpendKurus: 0, bigExpenseKurus: 0, bigExpenseYear: 1 }
    const sim = simulatePlan(input, 2, 5000000)
    expect(sim.points).toHaveLength(2)
    expect(sim.reachMonths).toBe(monthsToTarget(100000, 10000, 5000000, 2))
    expect(sim.reachMonths!).toBeGreaterThan(12)
    // Gelir kaybı hedefi geciktirir
    expect(simulatePlan({ ...input, incomeLossMonths: 6, incomeLossMonthlySpendKurus: 20000 }, 2, 5000000).reachMonths!).toBeGreaterThan(sim.reachMonths!)
    expect(simulatePlan({ ...input, monthlySavingKurus: 0 }, 0, 5000000).reachMonths).toBeNull()
    expect(durationLabel(0)).toBe('Şimdi')
    expect(durationLabel(7)).toBe('7 ay')
    expect(durationLabel(24)).toBe('2 yıl')
    expect(durationLabel(173)).toBe('14 yıl 5 ay')
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
