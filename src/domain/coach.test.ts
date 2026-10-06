import { describe, expect, it } from 'vitest'
import { answer, buildCoachPlan, coachMessages, restructure, simulateDebts, type CoachDebt } from './coach'
import type { JourneyFacts, JourneyProfile } from './journey'

const profile = (o: Partial<JourneyProfile> = {}): JourneyProfile => ({
  goal: 'independence',
  horizonYears: 20,
  targetMonthlyExpenseKurus: 2500000,
  monthlyIncomeKurus: 5000000,
  essentialMonthlyKurus: 2000000,
  incomeStability: 'regular',
  priorities: [],
  withdrawalRatePct: 4,
  celebrated: [],
  confirmedAt: '',
  ...o,
})
const facts = (o: Partial<JourneyFacts> = {}): JourneyFacts => ({
  averageExpenseKurus: null,
  expenseMonths: 0,
  recurringMonthlyKurus: 0,
  liquidKurus: 0,
  assetsKurus: 0,
  debtsKurus: 0,
  contributedKurus: 0,
  marketGainKurus: 0,
  recentMonthlyContributionKurus: 0,
  hasAssets: false,
  ...o,
})
const debt = (o: Partial<CoachDebt>): CoachDebt => ({ id: 'd', name: 'Borç', balanceKurus: 100000, monthlyRatePct: 0, minPaymentKurus: 10000, ...o })

describe('koç: borç kapatma', () => {
  it('faizsiz borç ödeme tutarına göre kapanır', () => {
    const r = simulateDebts([debt({})], 30000, 'avalanche')
    expect(r.months).toBe(4)
    expect(r.totalInterestKurus).toBe(0)
    expect(r.balances).toEqual([100000, 70000, 40000, 10000, 0])
  })
  it('asgari ödeme faizi karşılamıyorsa borç kapanmaz', () => {
    const r = simulateDebts([debt({ monthlyRatePct: 5, minPaymentKurus: 4000 })], 4000, 'avalanche')
    expect(r.months).toBeNull()
  })
  it('önce en yüksek faiz yöntemi toplam faizi azaltır', () => {
    const ds = [debt({ id: 'a', name: 'Kart', balanceKurus: 1000000, monthlyRatePct: 4, minPaymentKurus: 50000 }), debt({ id: 'b', name: 'Kredi', balanceKurus: 200000, monthlyRatePct: 1, minPaymentKurus: 20000 })]
    const av = simulateDebts(ds, 200000, 'avalanche')
    const sb = simulateDebts(ds, 200000, 'snowball')
    expect(av.totalInterestKurus).toBeLessThan(sb.totalInterestKurus)
    expect(sb.debts.find((d) => d.id === 'b')!.paidOffMonth).toBeLessThan(av.debts.find((d) => d.id === 'b')!.paidOffMonth!)
  })
  it('sabit planlı taksite erken ödeme yapılmaz', () => {
    const r = simulateDebts([debt({ id: 't', fixed: true, balanceKurus: 30000, minPaymentKurus: 10000 })], 100000, 'avalanche')
    expect(r.months).toBe(3)
  })
  it('daha düşük faizle yapılandırma faizden tasarruf ettirir', () => {
    const ds = [debt({ id: 'a', balanceKurus: 5000000, monthlyRatePct: 4.25, minPaymentKurus: 300000 })]
    const r = restructure(ds, ['a'], 2.5, 24, 300000, 'avalanche')!
    expect(r.savedKurus).toBeGreaterThan(0)
    expect(r.newPaymentKurus).toBeGreaterThan(0)
  })
})

describe('koç: plan', () => {
  it('borç, acil durum ve yatırım aşamalarını sırayla kurar', () => {
    const p = buildCoachPlan({ profile: profile(), facts: facts({ debtsKurus: 100000 }), debts: [debt({ balanceKurus: 100000, minPaymentKurus: 10000 })], debtsInExpenses: false, strategy: 'avalanche' })
    // gelir 50.000 − gider 20.000 = 30.000; düzenli gelir %90 → 27.000
    expect(p.surplusKurus).toBe(3000000)
    expect(p.monthlyPlanKurus).toBe(2700000)
    expect(p.bufferKurus).toBe(300000)
    expect(p.phases.map((x) => x.id)).toEqual(['debt', 'emergency', 'invest'])
    expect(p.phases[0].endMonth).toBe(1)
    // 60.000 acil durum hedefi / 27.000 → 3 ay
    expect(p.phases[1]).toMatchObject({ startMonth: 1, endMonth: 4 })
    expect(p.phases[2].startMonth).toBe(4)
    expect(answer('invest', p, facts(), null)).toContain('27.000 ₺')
  })
  it('borç ödemeleri gidere dahilse asgariler plana eklenir', () => {
    const p = buildCoachPlan({ profile: profile(), facts: facts(), debts: [debt({ balanceKurus: 1000000, minPaymentKurus: 100000 })], debtsInExpenses: true, strategy: 'avalanche' })
    expect(p.monthlyPlanKurus).toBe(2800000)
  })
  it('borcu olmayana doğrudan yatırım tutarı verir', () => {
    const p = buildCoachPlan({ profile: profile({ incomeStability: 'irregular' }), facts: facts({ liquidKurus: 9000000 }), debts: [], debtsInExpenses: false, strategy: 'avalanche' })
    expect(p.phases.map((x) => x.id)).toEqual(['invest'])
    expect(p.investMonthlyKurus).toBe(1800000)
  })
  it('asgari ödemeler sığmıyorsa uyarır', () => {
    const p = buildCoachPlan({ profile: profile({ monthlyIncomeKurus: 2100000 }), facts: facts(), debts: [debt({ balanceKurus: 1000000, minPaymentKurus: 500000 })], debtsInExpenses: false, strategy: 'avalanche' })
    expect(p.shortfallKurus).toBeGreaterThan(0)
    const m = coachMessages({ plan: p, hasProfile: true, budget: null, due: [], month: '2026-10', today: '2026-10-06', closedDebts: [] })
    expect(m[0].title).toBe('Asgari ödemeler bütçeyi aşıyor')
  })
  it('anket yoksa önce kişiyi tanımak ister', () => {
    const m = coachMessages({ plan: null, hasProfile: false, budget: null, due: [], month: '2026-10', today: '2026-10-06', closedDebts: [] })
    expect(m).toHaveLength(1)
    expect(m[0].link?.to).toBe('/yolculuk')
  })
})
