import { describe, expect, it } from 'vitest'
import { recommendedWithdrawalPct, RISK_PROFILES } from './assumptions'
import { averageMonthlyExpense, buildFreedomPlan, buildJourney, riskToleranceOf, durationLabel, emergencyMonthsFor, formatInBase, indexFactor, monthsToTarget, projectScenario, rebase, simulatePlan, targetCapital, testsLeft, type JourneyFacts, type JourneyProfile } from './journey'
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
    // güvence (Lean FI): hedefin %70'i (28.000) × 12 / %3,25 (yaş yok → 35, hedef 55, 90 yaşa 35 yıl)
    expect(j.plan.withdrawal).toEqual({ recommendedPct: 3.25, usedPct: 3.25, custom: false })
    expect(j.indicators.securityCapitalKurus).toBe(Math.round((2800000 * 12) / 0.0325))
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
    expect(j.indicators.securityCapitalKurus).toBe(Math.round((3500000 * 12) / 0.0325))
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
    const fi = j.stages.find((s) => s.id === 'independence')!
    expect(fi.conditions[0].target).toBe(j.indicators.goalKurus)
    expect(fi.etaMonths).toBe(monthsToTarget(j.indicators.progressKurus, saving, j.indicators.goalKurus, j.plan.realReturnPct))
    expect(j.stages.at(-1)!.conditions[0].target).toBe(j.plan.fatKurus)
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

describe('Özgürlük Rotası v2: hedef motoru', () => {
  const v2 = (o: Partial<JourneyProfile> = {}) =>
    profile({
      age: 30,
      targetAge: 50,
      lifeAge: 90,
      monthlyIncomeKurus: 10000000,
      spending: { housing: 2000000, food: 1500000, transport: 500000, bills: 500000, fun: 500000, other: 0 },
      targetSpendPct: 100,
      riskAnswers: [3, 3, 3, 3, 3, 3],
      ...o,
    })
  const f2 = (o: Partial<JourneyFacts> = {}) => facts({ assetsKurus: 0, debtsKurus: 0, liquidKurus: 0, debtList: [], recurringList: [], ...o })

  it('çekim oranı tablosu: süre uzadıkça oran düşer; kullanıcı değiştirebilir', () => {
    expect([10, 30, 31, 44, 45, 60].map(recommendedWithdrawalPct)).toEqual([3.5, 3.5, 3.25, 3.25, 3, 3])
    const p = buildFreedomPlan(v2(), f2(), { runs: 0 })
    // 50 → 90: 40 yıllık çekim
    expect(p.withdrawal).toEqual({ recommendedPct: 3.25, usedPct: 3.25, custom: false })
    // hedef: (50.000 aylık − 0) × 12 / %3,25
    expect(p.fiKurus).toBe(Math.round((5000000 * 12) / 0.0325))
    expect(p.leanKurus).toBe(Math.round((3500000 * 12) / 0.0325))
    const c = buildFreedomPlan(v2({ withdrawalCustom: true, withdrawalRatePct: 4 }), f2(), { runs: 0 })
    expect(c.withdrawal.usedPct).toBe(4)
    expect(c.fiKurus).toBe(Math.round((5000000 * 12) / 0.04))
  })

  it('hedef yaşam: yüzde, ev sahibi olma planı, büyük harcama ve garantili gelir', () => {
    const p = buildFreedomPlan(v2({ targetSpendPct: 80, ownHomePlan: true, annualBigSpendKurus: 1200000, pensionIncomeKurus: 1000000 }), f2(), { runs: 0 })
    // (50.000 − 20.000 kira) × %80 + 12.000/12
    expect(p.targetMonthlyKurus).toBe(2400000 + 100000)
    expect(p.annualNeedKurus).toBe((2500000 - 1000000) * 12)
  })

  it('gereken aylık birikim formülü: eklenen fark hedef yaşta hedefe ulaştırır', () => {
    const p = buildFreedomPlan(v2(), f2(), { runs: 0 })
    expect(p.monthlySavingKurus).toBe(5000000)
    const n = p.yearsToTarget * 12
    const rm = Math.pow(1 + p.realReturnPct / 100, 1 / 12) - 1
    const fv = (5000000 * (Math.pow(1 + rm, n) - 1)) / rm
    expect(p.gapKurus).toBe(Math.max(0, Math.ceil((p.fiKurus - fv) / ((Math.pow(1 + rm, n) - 1) / rm))))
    expect(p.requiredMonthlyKurus).toBe(p.monthlySavingKurus + p.gapKurus)
    const more = buildFreedomPlan(v2(), f2(), { runs: 0, extraMonthlyKurus: p.gapKurus })
    expect(more.reachMonths!).toBeLessThanOrEqual(n)
    expect(p.levers.extraMonthlyKurus).toBe(p.gapKurus)
    // Kaldıraç: bu birikimle yetişilen hedef yaşta hedefe ulaşılır
    expect(p.levers.targetAge!).toBeGreaterThan(p.targetAge)
  })

  it('borç bitişi birikimi artırır: faiz biter, taksit sıradakine sonra birikime gider', () => {
    const debt = { id: 'k', name: 'Kredi kartı', balanceKurus: 6000000, monthlyRatePct: 4, minPaymentKurus: 500000 }
    const withDebt = buildFreedomPlan(v2(), f2({ debtList: [debt] }), { runs: 0 })
    const noInterest = buildFreedomPlan(v2(), f2({ debtList: [{ ...debt, monthlyRatePct: 0 }] }), { runs: 0 })
    const end = withDebt.debtEnds[0]
    // Bütün aylık pay (50.000) faizli borca gider: iki ayda kapanır, sonra birikime eklenir
    expect(end.month).toBe(2)
    expect(withDebt.debtFreeMonth).toBe(2)
    expect(end.freedKurus).toBe(500000)
    expect(withDebt.monthlySavingKurus).toBe(5000000 - 240000)
    expect(withDebt.netKurus).toBe(-6000000)
    expect(withDebt.reachMonths!).toBeGreaterThanOrEqual(noInterest.reachMonths!)
    // Biten taksit ve düzenli ödemeler takvimde görünür
    const r = buildFreedomPlan(v2(), f2({ recurringList: [{ name: 'Telefon taksiti', monthlyKurus: 300000, installment: true, remainingMonths: 6 }, { name: 'Spor salonu', monthlyKurus: 100000, installment: false, remainingMonths: 3 }] }), { runs: 0 })
    expect(r.recurringEnds).toEqual([
      { name: 'Telefon taksiti', month: 6, freedKurus: 300000 },
      { name: 'Spor salonu', month: 3, freedKurus: 100000 },
    ])
    const r2 = buildFreedomPlan(v2(), f2({ recurringList: [{ name: 'Spor salonu', monthlyKurus: 100000, installment: false, remainingMonths: null }] }), { runs: 0 })
    expect(r.reachMonths!).toBeLessThanOrEqual(r2.reachMonths!)
  })

  it('Coast FI eşiği bileşik getiriyle bulunur', () => {
    const p = buildFreedomPlan(v2(), f2({ assetsKurus: 500000000 }), { runs: 0 })
    expect(p.coastKurus).toBe(Math.round(p.fiKurus / Math.pow(1 + p.realReturnPct / 100, 20)))
    expect(p.coastPassed).toBe(500000000 >= p.fiKurus / Math.pow(1 + p.realReturnPct / 100, 20))
  })

  it('risk: nihai profil tolerans ile kapasitenin düşük olanı', () => {
    expect(riskToleranceOf({ riskAnswers: [4, 4, 4, 4, 4, 4] })).toBe(3)
    expect(riskToleranceOf({ riskAnswers: [1, 1, 1, 1, 1, 1] })).toBe(0)
    expect(riskToleranceOf({ risk: 'bold' })).toBe(2)
    // Acil fon yok, 20 yıl, düzenli gelir, borç yok: (3 + 3 + 0 + 3) / 4 → 2
    const p = buildFreedomPlan(v2({ riskAnswers: [4, 4, 4, 4, 4, 4] }), f2(), { runs: 0 })
    expect(p.risk.tolerance).toBe(3)
    expect(p.risk.capacity).toBe(2)
    expect(p.risk.final).toBe(2)
    expect(p.realReturnPct).toBe(RISK_PROFILES[2].realReturnPct)
  })

  it('Monte Carlo tohumlu ve tekrarlanabilir; bantlar sıralı', () => {
    const a = buildFreedomPlan(v2(), f2({ assetsKurus: 100000000 }), { runs: 300 })
    const b = buildFreedomPlan(v2(), f2({ assetsKurus: 100000000 }), { runs: 300 })
    expect(a.successRate).toBe(b.successRate)
    expect(a.bands).toEqual(b.bands)
    expect(a.bands).toHaveLength(61)
    expect(a.bands[0]).toMatchObject({ age: 30, p10: 100000000, p50: 100000000 })
    for (const x of a.bands) expect(x.p10 <= x.p50 && x.p50 <= x.p90).toBe(true)
    expect(a.successRate).toBeGreaterThanOrEqual(0)
    expect(a.successRate).toBeLessThanOrEqual(1)
    // Birikim yoksa ve gider gelire eşitse para yetmez
    const none = buildFreedomPlan(v2({ monthlyIncomeKurus: 5000000 }), f2(), { runs: 200 })
    expect(none.successRate).toBe(0)
  })

  it('gelecekteki hedef: TL nominal enflasyonla, USD ve altın güncel kurla', () => {
    const p = buildFreedomPlan(v2({ inflationPct: 20 }), f2(), { runs: 0, rates: { USD: 40, XAU: 4000 } })
    expect(p.future.tlNominalKurus).toBe(Math.round(p.fiKurus * Math.pow(1.2, 20)))
    expect(p.future.usd).toBe(Math.round(p.fiKurus / 100 / 40))
    expect(p.future.goldGr).toBe(Math.round((p.fiKurus / 100 / 4000) * 10) / 10)
  })

  it('eski profiller bozulmaz: hedef yaş ve süre yaştan ve hedef süresinden türetilir', () => {
    const old = profile({ age: 40, horizonYears: 15 })
    const p = buildFreedomPlan(old, facts(), { runs: 0 })
    expect(p.targetAge).toBe(55)
    expect(p.lifeAge).toBe(90)
    expect(p.yearsToTarget).toBe(15)
    // Harcama grubu yoksa eski hedef gider kullanılır; eski %4 önerilen orana döner
    expect(p.targetMonthlyKurus).toBe(4000000)
    expect(p.withdrawal.custom).toBe(false)
    expect(p.monthlySavingKurus).toBe(1500000)
    expect(p.netKurus).toBe(18000000)
    expect(buildFreedomPlan(profile({ withdrawalRatePct: 3 }), facts(), { runs: 0 }).withdrawal).toMatchObject({ custom: true, usedPct: 3 })
    expect(buildJourney(old, facts()).plan.fiKurus).toBe(p.fiKurus)
  })
})
