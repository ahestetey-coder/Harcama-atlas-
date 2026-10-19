import { describe, expect, it } from 'vitest'
import { TUIK_HBA_2025_BP } from './assumptions'
import { AUTO_MAX_CATEGORIES } from './autoBudget'
import {
  buildBucketBudget,
  CATEGORY_BUCKET,
  CATEGORY_PRIOR_BP,
  categoryBucketOf,
  fixedSpendSplit,
  toAutoBudget,
  type BucketBudget,
  type BucketInput,
  type FixedLine,
  type LimitCandidate,
} from './bucketBudget'
import type { IncomeBasis } from './income'
import { DEFAULT_CATEGORIES } from '../data/seed'

const tl = (lira: number) => Math.round(lira * 100)
const STEP = tl(100)

const basis = (lira: number, extra: Partial<IncomeBasis> = {}): IncomeBasis => ({
  monthlyKurus: tl(lira),
  source: 'plan',
  plannedKurus: tl(lira),
  irregularKurus: 0,
  oneOffKurus: 0,
  reservedKurus: 0,
  upcoming: [],
  salaryUpdateKurus: null,
  confidence: 'high',
  ...extra,
})

const line = (key: string, kind: FixedLine['kind'], lira: number, flags: Partial<FixedLine> = {}): FixedLine => ({
  key,
  label: key,
  kind,
  monthlyKurus: tl(lira),
  periodKurus: tl(lira),
  housing: false,
  consumer: false,
  inSpending: true,
  source: 'profile',
  ...flags,
})
// Ücretsiz yol: kısa beyan (budgetProfile)
const rent = (lira: number) => line('profile:housingKurus', 'housing', lira, { housing: true })
const bills = (lira: number) => line('profile:billsKurus', 'bill', lira)
const card = (lira: number) => line('profile:cardPaymentKurus', 'debt', lira, { consumer: true, inSpending: false })
const mortgage = (lira: number) => line('profile:housingKurus', 'debt', lira, { housing: true })

// Varsayılan kategorilerden limit adayları (kova need/want olanlar), geçmiş verilebilir
const candidates = (history: Record<string, number> = {}): LimitCandidate[] =>
  DEFAULT_CATEGORIES.map((c, order) => ({ c, order, bucket: CATEGORY_BUCKET[c.id] }))
    .filter((x) => x.bucket === 'need' || x.bucket === 'want')
    .map(({ c, order, bucket }) => ({ id: c.id, bucket: bucket as 'need' | 'want', priorBp: CATEGORY_PRIOR_BP[c.id] ?? 0, historyKurus: history[c.id] ?? 0, order }))

const payday = { nominal: '2026-10-15', date: '2026-10-15', shifted: false }

/** §8 örnek: 60.000 maaş, kira 18.000, faturalar 3.000, kart asgari 4.000 (bakiye 20.000), birikim 0. */
const example = (over: Partial<BucketInput> = {}): BucketInput => ({
  income: basis(60_000),
  fixed: [rent(18_000), bills(3_000), card(4_000)],
  consumerBalanceKurus: tl(20_000),
  goalsKurus: 0,
  liquidKurus: 0,
  household: { stability: 'regular', dependents: 0, earners: null },
  journeySpending: null,
  candidates: candidates(),
  history: null,
  payday,
  detail: true,
  periodDays: 30,
  ...over,
})

const build = (over: Partial<BucketInput> = {}) => buildBucketBudget(example(over))!
const kovalar = (b: BucketBudget) => [b.buckets.fixed.kurus, b.buckets.needs.kurus, b.buckets.wants.kurus, b.buckets.saving.kurus]

describe('dört kovalı bütçe: örnek hesap (§8)', () => {
  const b = build()

  it('kovalar ve yüzdeler', () => {
    expect(kovalar(b)).toEqual([tl(25_000), tl(20_000), tl(6_000), tl(9_000)])
    expect(kovalar(b).reduce((s, k) => s + k, 0)).toBe(tl(60_000))
    expect(b.buckets.fixed.pct).toBeCloseTo(0.4167, 4)
    expect(b.buckets.needs.pct).toBeCloseTo(0.3333, 4)
    expect(b.buckets.wants.pct).toBeCloseTo(0.1, 10)
    expect(b.buckets.saving.pct).toBeCloseTo(0.15, 10)
    expect(b.incomeKurus).toBe(tl(60_000))
  })

  it('ihtiyaçlar TÜİK payından: 60.000 × 0,418 × 0,8 = 20.064 → 20.000', () => {
    expect(b.needs).toEqual({ priorKurus: tl(20_064), historyKurus: null, historyWeight: 0 })
  })

  it('birikim merdiveni, harcama bütçesi ve bütçe dışı', () => {
    expect(b.saving).toEqual({ kurus: tl(9_000), targetKurus: tl(12_000), debtExtraKurus: 0, cutKurus: tl(3_000), lowIncome: false })
    expect(b.spendKurus).toBe(tl(47_000))
    expect(b.outsideKurus).toBe(tl(4_000))
    // Harcama + kart + birikim = gelir
    expect(b.spendKurus + b.outsideKurus + b.buckets.saving.kurus).toBe(tl(60_000))
    expect(b.shortfallKurus).toBe(0)
  })

  it('oranlar: konut tam %30 geçer, uyarı yok', () => {
    expect(b.checks.housingPct).toBeCloseTo(0.3, 10)
    expect(b.checks.dtiPct).toBeCloseTo(0.0667, 4)
    expect(b.checks.consumerPct).toBeCloseTo(0.0667, 4)
    expect(b.checks.savingPct).toBeCloseTo(0.15, 10)
    expect(b.checks.mustHavePct).toBeCloseTo(0.75, 10)
    expect(b.broken).toEqual([])
    expect(b.alert).toBeNull()
  })

  it('acil durum fonu: 1 aylık 45.000, sonra 3–6 ay; tek gelirde 6–9 ay', () => {
    expect(b.emergency).toEqual({ essentialKurus: tl(45_000), starterKurus: tl(45_000), minMonths: 3, maxMonths: 6, liquidKurus: 0 })
    expect(b.emergency.minMonths * b.emergency.essentialKurus).toBe(tl(135_000))
    expect(b.emergency.maxMonths * b.emergency.essentialKurus).toBe(tl(270_000))
    const single = build({ household: { stability: 'regular', dependents: 0, earners: 1 } })
    expect([single.emergency.minMonths * single.emergency.essentialKurus, single.emergency.maxMonths * single.emergency.essentialKurus]).toEqual([tl(270_000), tl(405_000)])
  })

  it('birikimin tamamı başlangıç fonuna; 5 maaş günü', () => {
    expect(b.destinations).toEqual({ emergencyKurus: tl(9_000), debtKurus: 0, goalsKurus: 0, growKurus: 0, stage: 'starter', monthsToStage: 5 })
    // Başlangıç fonundan sonra kart borcu, sonra acil durum fonu
    expect(build({ liquidKurus: tl(45_000) }).destinations.stage).toBe('debt')
    expect(build({ liquidKurus: tl(45_000), consumerBalanceKurus: 0 }).destinations.stage).toBe('emergency')
  })

  it('maaş günü ve maaş güncellemesi motordan aynen geçer', () => {
    expect(b.payday).toEqual(payday)
    expect(b.salaryUpdateKurus).toBeNull()
    expect(build({ income: basis(60_000, { salaryUpdateKurus: tl(72_000) }) }).salaryUpdateKurus).toBe(tl(72_000))
  })

  it('kategori limitleri (Plus): ilk 6, 50 TL tabanı', () => {
    expect(b.categoryLimits).toEqual({
      'cat-market': tl(8_250),
      'cat-akaryakit': tl(4_900),
      'cat-ulasim': tl(4_900),
      'cat-diger': tl(2_700),
      'cat-restoran': tl(1_650),
      'cat-saglik': tl(1_050),
    })
    expect(Object.keys(b.categoryLimits)).toHaveLength(AUTO_MAX_CATEGORIES)
    // Giyim 1.000 ve eğitim 850 (7. ve 8.) dışarıda; eğlence 550, %3 tabanı olan 780'in altında
    for (const id of ['cat-giyim', 'cat-egitim', 'cat-eglence', 'cat-faturalar', 'cat-bebek', 'cat-abonelik']) expect(b.categoryLimits[id]).toBeUndefined()
    const share = (budget: number, id: string, P: number) => Math.max(0, Math.floor(Math.round((budget * CATEGORY_PRIOR_BP[id]) / P) / tl(50)) * tl(50))
    expect(share(tl(6_000), 'cat-giyim', 2460)).toBe(tl(1_000))
    expect(share(tl(20_000), 'cat-egitim', 4180)).toBe(tl(850))
    expect(share(tl(6_000), 'cat-eglence', 2460)).toBe(tl(550))
    expect(Math.round(0.03 * tl(26_000))).toBe(tl(780))
  })

  it('haftalık: 30 günlük dönemde 6.050, 31 günlükte 5.850', () => {
    expect(b.weeklyKurus).toBe(tl(6_050))
    expect(build({ periodDays: 31 }).weeklyKurus).toBe(tl(5_850))
  })

  it('AutoBudget alanları', () => {
    const lines = example().fixed
    const { recurringKurus, debtKurus } = fixedSpendSplit(lines)
    const a = toAutoBudget(b, 'plan', 0, recurringKurus, debtKurus)
    expect(a).toMatchObject({
      incomeKurus: tl(60_000),
      incomeSource: 'plan',
      totalKurus: tl(47_000),
      recurringKurus: tl(21_000),
      debtKurus: 0,
      flexibleKurus: tl(26_000),
      savingKurus: tl(9_000),
      extraSavingKurus: tl(9_000),
      goalsKurus: 0,
      savingCutKurus: tl(3_000),
      shortfallKurus: 0,
      historyKurus: null,
      cutPct: 0,
      weeklyKurus: tl(6_050),
    })
    expect(a.recurringKurus + a.debtKurus + a.flexibleKurus).toBe(a.totalKurus)
    expect(a.buckets).toBe(b)
  })

  it('Plus yolu (düzenli ödemeler ve kart varlığı) aynı sonucu verir', () => {
    const plus = build({
      fixed: [
        line('rec:kira', 'housing', 18_000, { housing: true, source: 'recurring' }),
        line('rec:fatura', 'bill', 3_000, { source: 'recurring' }),
        line('debt:kart', 'debt', 4_000, { consumer: true, inSpending: false, source: 'asset' }),
      ],
    })
    expect(plus).toEqual(b)
  })

  it('Ücretsiz (detail kapalı): limit ve haftalık yok, kovalar aynı', () => {
    const free = build({ detail: false })
    expect(free.categoryLimits).toEqual({})
    expect(free.weeklyKurus).toBeNull()
    expect(kovalar(free)).toEqual(kovalar(b))
    expect(free.spendKurus).toBe(tl(47_000))
  })
})

describe('dört kovalı bütçe: örnek varyantları (§8)', () => {
  it('kart asgari 14.000: birikim %5, uyarı kart ve kredi %23,3', () => {
    const b = build({ fixed: [rent(18_000), bills(3_000), card(14_000)] })
    expect(kovalar(b)).toEqual([tl(35_000), tl(20_000), tl(2_000), tl(3_000)])
    expect(b.saving.kurus).toBe(tl(3_000))
    expect(b.checks.savingPct).toBeCloseTo(0.05, 10)
    expect(b.saving.lowIncome).toBe(true)
    expect(b.saving.debtExtraKurus).toBe(0)
    expect(b.spendKurus).toBe(tl(43_000))
    expect(b.alert).toBe('consumer')
    expect(b.broken).toEqual(['consumer', 'saving'])
    expect(b.checks.consumerPct).toBeCloseTo(0.2333, 4)
  })

  it('gelir 150.000, kart 32.000 (%21,3): isteklerden 1.900 borca', () => {
    const b = build({ income: basis(150_000), fixed: [rent(18_000), bills(3_000), card(32_000)] })
    expect(b.buckets.needs.kurus).toBe(tl(50_100))
    expect(b.buckets.wants.kurus).toBe(tl(15_000))
    expect(b.saving.debtExtraKurus).toBe(tl(1_900))
    expect(b.saving.kurus).toBe(tl(30_000))
    expect(b.buckets.saving.kurus).toBe(tl(31_900))
    expect(b.spendKurus).toBe(tl(86_100))
    expect(b.checks.consumerPct).toBeCloseTo(0.2133, 4)
    expect(b.alert).toBe('consumer')
    expect(kovalar(b).reduce((s, k) => s + k, 0)).toBe(tl(150_000))
    expect(b.destinations.debtKurus).toBeGreaterThanOrEqual(tl(1_900))
  })

  it('düşük gelir 30.000: istek ve birikim 1.500, uyarı konut %40', () => {
    const b = build({ income: basis(30_000), fixed: [rent(12_000), bills(3_000), card(2_000)] })
    expect(b.buckets.needs.kurus).toBe(tl(10_000))
    expect(b.buckets.wants.kurus).toBe(tl(1_500))
    expect(b.saving.kurus).toBe(tl(1_500))
    expect(b.spendKurus).toBe(tl(26_500))
    expect(b.alert).toBe('housing')
    expect(b.checks.housingPct).toBeCloseTo(0.4, 10)
    expect(b.broken).toEqual(['housing', 'saving'])
  })

  it('açık: kira 30.000, kart 12.000, faturalar 3.000 → 5.000 açık; ihtiyaçlar kısılmaz', () => {
    const b = build({ fixed: [rent(30_000), card(12_000), bills(3_000)] })
    expect(b.buckets.fixed.kurus).toBe(tl(45_000))
    expect(b.buckets.needs.kurus).toBe(tl(20_000))
    expect(b.shortfallKurus).toBe(tl(5_000))
    expect(b.buckets.wants.kurus).toBe(0)
    expect(b.buckets.saving.kurus).toBe(0)
    expect(b.spendKurus).toBe(tl(53_000))
    expect(b.saving.lowIncome).toBe(false)
    // Konut %50 kırık; kart ve kredi tam %20, geçer
    expect(b.broken).toEqual(['shortfall', 'housing'])
    expect(b.checks.consumerPct).toBeCloseTo(0.2, 10)
    expect(b.alert).toBe('shortfall')
  })

  it('yıllık ikramiye 24.000 (ilk ödeme 20 Eylül): gelir 62.000, 22.000 ayrılır', () => {
    const b = build({ income: basis(62_000, { plannedKurus: tl(62_000), reservedKurus: tl(22_000) }) })
    expect(b.buckets.needs.kurus).toBe(tl(20_700))
    expect(b.buckets.wants.kurus).toBe(tl(6_200))
    expect(b.saving.kurus).toBe(tl(10_100))
    expect(b.spendKurus).toBe(tl(47_900))
    expect(b.reservedKurus).toBe(tl(22_000))
  })

  it('3 dönem geçmiş (ihtiyaç ortalaması 17.000): birikim %20; 1 dönemde ihtiyaçlar 19.000', () => {
    const b = build({ history: { needKurus: tl(17_000), wantKurus: tl(5_000), months: 3 } })
    expect(b.needs.historyWeight).toBe(1)
    expect(b.buckets.needs.kurus).toBe(tl(17_000))
    expect(b.buckets.wants.kurus).toBe(tl(6_000))
    expect(b.saving.kurus).toBe(tl(12_000))
    expect(b.checks.savingPct).toBeCloseTo(0.2, 10)
    expect(b.spendKurus).toBe(tl(44_000))
    expect(b.historyKurus).toBe(tl(22_000))
    expect(b.needs.historyKurus).toBe(tl(17_000))
    const one = build({ history: { needKurus: tl(17_000), wantKurus: tl(5_000), months: 1 } })
    expect(one.buckets.needs.kurus).toBe(tl(19_000))
    expect(one.needs.historyWeight).toBeCloseTo(1 / 3, 10)
  })

  it('hedefler 15.000: %10 istek tabanı korunur, birikim 9.000', () => {
    const b = build({ goalsKurus: tl(15_000) })
    expect(b.saving.kurus).toBe(tl(9_000))
    expect(b.buckets.wants.kurus).toBe(tl(6_000))
    expect(b.saving.cutKurus).toBe(tl(6_000))
    const a = toAutoBudget(b, 'plan', tl(15_000), tl(21_000), 0)
    expect(a.goalsKurus).toBe(tl(9_000))
    expect(a.savingCutKurus).toBe(tl(6_000))
    expect(a.extraSavingKurus).toBe(0)
  })

  it('5 Ekim tek seferlik 20.000: kovalar aynı, 29.000 başlangıç fonuna, kalan 16.000 için 2 maaş günü daha', () => {
    const base = build()
    const b = build({ income: basis(60_000, { oneOffKurus: tl(20_000) }) })
    expect(kovalar(b)).toEqual(kovalar(base))
    expect(b.spendKurus).toBe(base.spendKurus)
    expect(b.checks).toEqual(base.checks)
    expect(b.oneOffKurus).toBe(tl(20_000))
    expect(b.destinations.emergencyKurus).toBe(tl(29_000))
    expect(b.destinations.stage).toBe('starter')
    const gap = b.emergency.starterKurus - b.destinations.emergencyKurus
    expect(gap).toBe(tl(16_000))
    expect(Math.ceil(gap / b.saving.kurus)).toBe(2)
    // Bu dönem dahil 3 maaş günü
    expect(b.destinations.monthsToStage).toBe(3)
  })

  it('sabit gider yok, kayıtlardan 40.000 (e2e yolu): haftalık gösterilir', () => {
    const b = build({ income: basis(40_000, { source: 'records', plannedKurus: 0, confidence: 'low' }), fixed: [], consumerBalanceKurus: 0, liquidKurus: null })
    // Faturalar sabit satırda değil: ihtiyaç payı 4540
    expect(b.needs.priorKurus).toBe(tl(14_528))
    expect(b.buckets.needs.kurus).toBe(tl(14_500))
    expect(b.buckets.wants.kurus).toBe(tl(12_000))
    expect(b.saving.kurus).toBe(tl(13_500))
    expect(b.spendKurus).toBe(tl(26_500))
    expect(b.weeklyKurus).not.toBeNull()
  })
})

describe('dört kovalı bütçe: kurallar', () => {
  // Basit, tekrarlanabilir rastgele sayı (mulberry32)
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  it('rastgele girdilerde: N, W, debtExtra 100 TL katı; S ≥ 0; açık yoksa toplam = gelir', () => {
    const r = rng(20261012)
    const kurus = (max: number) => Math.round(r() * max)
    for (let i = 0; i < 500; i++) {
      const I = 1_000_000 + kurus(30_000_000)
      const fixed: FixedLine[] = []
      if (r() < 0.8) fixed.push({ ...rent(0), monthlyKurus: kurus(I * 0.5), periodKurus: kurus(I * 0.5) })
      if (r() < 0.7) fixed.push({ ...bills(0), monthlyKurus: kurus(I * 0.1), periodKurus: kurus(I * 0.1) })
      if (r() < 0.6) fixed.push({ ...card(0), monthlyKurus: kurus(I * 0.4) })
      if (r() < 0.3) fixed.push(line('inst:x', 'debt', 0, { consumer: true, monthlyKurus: kurus(I * 0.2), periodKurus: kurus(I * 0.2) }))
      const months = Math.floor(r() * 4)
      const input = example({
        income: { ...basis(0), monthlyKurus: I, oneOffKurus: r() < 0.2 ? kurus(I) : 0 },
        fixed,
        goalsKurus: r() < 0.3 ? kurus(I * 0.4) : 0,
        liquidKurus: r() < 0.2 ? null : kurus(I * 5),
        consumerBalanceKurus: kurus(I * 2),
        history: months ? { needKurus: kurus(I * 0.6), wantKurus: kurus(I * 0.4), months } : null,
        candidates: candidates({ 'cat-market': kurus(I * 0.2), 'cat-restoran': kurus(I * 0.1), 'cat-giyim': kurus(I * 0.05) }),
        periodDays: 28 + Math.floor(r() * 4),
      })
      const b = buildBucketBudget(input)!
      const [F, N, W, S4] = kovalar(b)
      const dE = b.saving.debtExtraKurus
      const S = b.saving.kurus
      expect(N % STEP).toBe(0)
      expect(W % STEP).toBe(0)
      expect(dE % STEP).toBe(0)
      expect(S4).toBe(S + dE)
      if (b.shortfallKurus === 0) {
        expect(S).toBeGreaterThanOrEqual(0)
        expect(F + N + W + dE + S).toBe(I)
        // Taban: istekler %10 tabanını, birikim %5'i (sığdığı kadar) alır
        expect(W + dE).toBeLessThanOrEqual(Math.round(I * 0.3))
      } else {
        expect([W, S, dE]).toEqual([0, 0, 0])
        expect(I - F - N).toBe(-b.shortfallKurus)
      }
      const spend = fixedSpendSplit(fixed)
      expect(b.spendKurus).toBe(spend.recurringKurus + spend.debtKurus + N + W)
      const a = toAutoBudget(b, 'plan', input.goalsKurus, spend.recurringKurus, spend.debtKurus)
      expect(a.recurringKurus + a.debtKurus + a.flexibleKurus).toBe(a.totalKurus)
      expect(Object.keys(b.categoryLimits).length).toBeLessThanOrEqual(AUTO_MAX_CATEGORIES)
      for (const v of Object.values(b.categoryLimits)) {
        expect(v % tl(50)).toBe(0)
        expect(v).toBeGreaterThan(0)
      }
      const d = b.destinations
      expect(d.emergencyKurus + d.debtKurus + d.goalsKurus + d.growKurus).toBe(S + dE + b.oneOffKurus)
    }
  })

  it('konut: tam %30 geçer, %30,1 kırık', () => {
    expect(build({ fixed: [rent(18_000)] }).broken).not.toContain('housing')
    expect(build({ fixed: [rent(18_060)] }).broken).toContain('housing')
  })

  it('borç/gelir konut kredisini içerir, kirayı içermez', () => {
    const m = build({ fixed: [mortgage(22_000)] })
    expect(m.checks.dtiPct).toBeCloseTo(22 / 60, 10)
    expect(m.checks.housingPct).toBeCloseTo(22 / 60, 10)
    expect(m.broken).toEqual(['dti', 'housing'])
    const r = build({ fixed: [rent(22_000)] })
    expect(r.checks.dtiPct).toBe(0)
    expect(r.broken).toEqual(['housing'])
  })

  it('kart ve kredi: tam %20 geçer, aşarsa kırık', () => {
    expect(build({ fixed: [card(12_000)] }).broken).not.toContain('consumer')
    expect(build({ fixed: [card(12_100)] }).broken).toContain('consumer')
  })

  it('uyarı önceliği: açık > kart ve kredi > borç/gelir > konut > birikim', () => {
    const all = build({ fixed: [mortgage(25_000), card(15_000), bills(3_000)] })
    expect(all.broken).toEqual(['shortfall', 'consumer', 'dti', 'housing'])
    expect(all.alert).toBe('shortfall')
    const consumer = build({ income: basis(100_000), fixed: [mortgage(31_000), card(21_000)] })
    expect(consumer.broken).toEqual(['consumer', 'dti', 'housing', 'saving'])
    expect(consumer.alert).toBe('consumer')
    const dti = build({ income: basis(100_000), fixed: [mortgage(37_000), bills(3_000)] })
    expect(dti.broken).toEqual(['dti', 'housing'])
    expect(dti.alert).toBe('dti')
    const housing = build({ income: basis(100_000), fixed: [rent(31_000), bills(3_000)] })
    expect(housing.broken).toEqual(['housing'])
    const saving = build({ income: basis(30_000), fixed: [rent(9_000), bills(3_000), card(5_000)] })
    expect(saving.broken).toEqual(['saving'])
    expect(saving.alert).toBe('saving')
  })

  it('acil durum aralıkları', () => {
    const range = (household: BucketInput['household']) => {
      const e = build({ household }).emergency
      return [e.minMonths, e.maxMonths]
    }
    expect(range({ stability: 'regular', dependents: 0, earners: null })).toEqual([3, 6])
    expect(range({ stability: 'regular', dependents: 0, earners: 2 })).toEqual([3, 6])
    expect(range({ stability: 'regular', dependents: 0, earners: 1 })).toEqual([6, 9])
    expect(range({ stability: 'regular', dependents: 2, earners: 2 })).toEqual([6, 9])
    expect(range({ stability: 'variable', dependents: 0, earners: 2 })).toEqual([6, 9])
    expect(range({ stability: 'irregular', dependents: 0, earners: 2 })).toEqual([9, 9])
  })

  it('aşamalar: birikim bilinmiyorsa yok; sonra başlangıç, borç, acil durum, büyüt', () => {
    const unknown = build({ liquidKurus: null })
    expect(unknown.destinations).toEqual({ emergencyKurus: tl(9_000), debtKurus: 0, goalsKurus: 0, growKurus: 0, stage: null, monthsToStage: null })
    expect(build({ liquidKurus: 0 }).destinations.stage).toBe('starter')
    const debt = build({ liquidKurus: tl(45_000) })
    expect(debt.destinations).toMatchObject({ stage: 'debt', debtKurus: tl(9_000), emergencyKurus: 0, monthsToStage: 3 })
    const em = build({ liquidKurus: tl(45_000), consumerBalanceKurus: 0 })
    // 3 ay × 45.000 = 135.000; açık 90.000 → 10 maaş günü
    expect(em.destinations).toMatchObject({ stage: 'emergency', emergencyKurus: tl(9_000), monthsToStage: 10 })
    const grow = build({ liquidKurus: tl(135_000), consumerBalanceKurus: 0 })
    expect(grow.destinations).toMatchObject({ stage: 'grow', growKurus: tl(9_000), monthsToStage: null })
  })

  it('birikim havuzu: başlangıç fonu, borç, hedefler, acil durum, kalan büyümeye', () => {
    const b = build({ income: basis(60_000, { oneOffKurus: tl(100_000) }), liquidKurus: tl(40_000), consumerBalanceKurus: tl(20_000), goalsKurus: tl(10_000) })
    // R = 9.000 + 100.000: başlangıca 5.000, borca 20.000, hedeflere 10.000, acil duruma kalan 74.000 (sınır 135.000 − 40.000 − 5.000 = 90.000)
    expect(b.destinations.emergencyKurus + b.destinations.debtKurus + b.destinations.goalsKurus + b.destinations.growKurus).toBe(tl(109_000))
    expect(b.destinations.debtKurus).toBe(tl(20_000))
    expect(b.destinations.goalsKurus).toBe(tl(10_000))
    expect(b.destinations.emergencyKurus).toBe(tl(79_000))
    expect(b.destinations.growKurus).toBe(0)
  })
})

describe('dört kovalı bütçe: ihtiyaç tahmini ve limitler', () => {
  it('Yolculuk testi harcaması verilirse ihtiyaç tahmini: gıda + ulaşım + diğerin 400/1940’ı', () => {
    const b = build({ journeySpending: { housing: tl(18_000), food: tl(10_000), transport: tl(5_000), bills: tl(3_000), fun: tl(4_000), other: tl(9_700) } })
    expect(b.needs.priorKurus).toBe(tl(17_000))
    expect(b.buckets.needs.kurus).toBe(tl(17_000))
  })

  it('faturalar sabit satırda yoksa iletişim payı ihtiyaçlara girer (4540)', () => {
    expect(build({ fixed: [rent(18_000), card(4_000)] }).needs.priorKurus).toBe(Math.round((tl(60_000) * 4540 * 8) / 100_000))
  })

  it('akaryakıt 4.900; kuruşa yuvarlama 50 TL tabanından önce (4.499,99 → 4.450 hatası yok)', () => {
    expect(build().categoryLimits['cat-akaryakit']).toBe(tl(4_900))
    // N = 17.100 ve w = 2/3: sağlık payı tam 5.050 TL; kayan noktada 504.999,99 kuruş çıkar
    const b = build({
      income: basis(82_000),
      history: { needKurus: tl(12_000), wantKurus: 0, months: 2 },
      candidates: candidates({ 'cat-market': tl(7_000), 'cat-saglik': tl(5_000) }),
    })
    expect(b.buckets.needs.kurus).toBe(tl(17_100))
    expect(b.categoryLimits['cat-saglik']).toBe(tl(5_050))
  })

  it('limitler kovanın bütçesini aşmaz; faturalar sabitse faturalara limit konmaz', () => {
    const b = build()
    const need = ['cat-market', 'cat-akaryakit', 'cat-ulasim', 'cat-saglik'].reduce((s, id) => s + (b.categoryLimits[id] ?? 0), 0)
    expect(need).toBeLessThanOrEqual(b.buckets.needs.kurus)
    expect(b.categoryLimits['cat-faturalar']).toBeUndefined()
  })

  it('geçmiş limiti ortalamanın altına düşürürse kısıntı yüzdesi', () => {
    const b = build({ history: { needKurus: tl(20_000), wantKurus: tl(16_000), months: 3 } })
    // N + W = 20.000 + 6.000 = 26.000; geçmiş 36.000 → %28 kısıntı
    expect(b.buckets.needs.kurus + b.buckets.wants.kurus).toBe(tl(26_000))
    expect(b.cutPct).toBe(28)
    expect(build({ history: { needKurus: tl(20_000), wantKurus: tl(16_000), months: 3 }, detail: false }).cutPct).toBe(0)
  })

  it('gelir yoksa bütçe kurulmaz', () => {
    expect(buildBucketBudget(example({ income: basis(0) }))).toBeNull()
  })
})

describe('kategori → kova', () => {
  it('14 varsayılan kategori', () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(14)
    const expected: Record<string, string> = {
      'cat-market': 'need',
      'cat-akaryakit': 'need',
      'cat-ulasim': 'need',
      'cat-faturalar': 'need',
      'cat-saglik': 'need',
      'cat-egitim': 'need',
      'cat-bebek': 'need',
      'cat-restoran': 'want',
      'cat-giyim': 'want',
      'cat-eglence': 'want',
      'cat-diger': 'want',
      'cat-abonelik': 'want',
      'cat-kira': 'fixed',
      'cat-banka': 'fee',
    }
    for (const c of DEFAULT_CATEGORIES) expect(categoryBucketOf(c.id, c.name)).toBe(expected[c.id])
  })

  it('kullanıcı kategorileri addan', () => {
    expect(categoryBucketOf('u1', 'Kreş')).toBe('need')
    expect(categoryBucketOf('u2', 'Okul servisi')).toBe('need')
    expect(categoryBucketOf('u3', 'Aidat')).toBe('fixed')
    expect(categoryBucketOf('u4', 'Kredi faizi')).toBe('fee')
    expect(categoryBucketOf('u5', 'Araç kiralama')).toBe('want')
    expect(categoryBucketOf('u6', 'Hobi')).toBe('want')
    expect(categoryBucketOf('u7', 'Ev kirası')).toBe('fixed')
    expect(categoryBucketOf('u8', 'KİRA')).toBe('fixed')
    expect(categoryBucketOf('u9', 'Su')).toBe('need')
    expect(categoryBucketOf('u10', 'Susam')).toBe('want')
    expect(categoryBucketOf('u11', 'Kart ücreti')).toBe('fee')
  })

  it('TÜİK payları: toplam 10010; ihtiyaç 4180 / 4540, istek 2460', () => {
    expect(Object.values(TUIK_HBA_2025_BP).reduce((s, v) => s + v, 0)).toBe(10010)
    const sum = (bucket: string, skip: string[] = []) =>
      Object.entries(CATEGORY_PRIOR_BP)
        .filter(([id]) => CATEGORY_BUCKET[id] === bucket && !skip.includes(id))
        .reduce((s, [, v]) => s + v, 0)
    expect(sum('need', ['cat-faturalar'])).toBe(4180)
    expect(sum('need')).toBe(4540)
    expect(sum('want')).toBe(2460)
    // Dışarıda kalan: konut ve kira + sigorta ve finansal
    expect(10010 - 4540 - 2460).toBe(TUIK_HBA_2025_BP.housing + TUIK_HBA_2025_BP.insuranceFinance)
    expect(CATEGORY_PRIOR_BP['cat-kira']).toBeUndefined()
    expect(CATEGORY_PRIOR_BP['cat-banka']).toBeUndefined()
  })
})
