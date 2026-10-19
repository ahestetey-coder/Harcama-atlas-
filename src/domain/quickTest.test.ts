import { describe, expect, it } from 'vitest'
import { buildJourney } from './journey'
import { estimate, reachRange, isQuickAnswers, LEAD_CODE_RE, newLeadCode, quickResult, quickScenario, QUICK_QUESTIONS, seedFacts, seedProfile, targetSplit, type QuickAnswers } from './quickTest'

const answers = (o: Partial<QuickAnswers> = {}): QuickAnswers => ({
  v: 1,
  amac: 'calismadan_gecinmek',
  hayal: 60000,
  gelir: 'g3',
  kalan: 'orta',
  borc: 'kredi_rahat',
  acil: 'a1',
  birikim: 'b2',
  nerede: ['mevduat', 'altin'],
  yatirim: 'arasira',
  dusus: 'bekle',
  ...o,
})

describe('web hızlı testi', () => {
  it('10 soru vardır ve cevap doğrulaması bozuk veriyi reddeder', () => {
    expect(QUICK_QUESTIONS).toHaveLength(10)
    expect(isQuickAnswers(answers())).toBe(true)
    expect(isQuickAnswers({ ...answers(), gelir: 'g9' })).toBe(false)
    expect(isQuickAnswers({ ...answers(), nerede: ['ev'] })).toBe(false)
    expect(isQuickAnswers({ ...answers(), v: 2 })).toBe(false)
    expect(isQuickAnswers(null)).toBe(false)
  })

  it('aralıkları tahmini rakamlara çevirir', () => {
    const e = estimate(answers())
    expect(e.incomeTl).toBe(75000)
    expect(e.debts).toHaveLength(1)
    expect(e.debtPaymentTl).toBe(11300)
    // gelir × (1 − %15) − taksit
    expect(e.spendTl).toBe(52500)
    expect(e.assetsTl).toBe(250000)
    // acil fon 2 ay × (harcama + taksit), birikimden fazla olamaz
    expect(e.liquidTl).toBe(250000)
    const zor = estimate(answers({ borc: 'zor', kalan: 'eksi', birikim: 'b0' }))
    expect(zor.debts.map((d) => d.type)).toEqual(['card', 'loan'])
    expect(zor.spendTl).toBeGreaterThanOrEqual(zor.incomeTl * 0.3)
    expect(zor.liquidTl).toBe(0)
  })

  it('kripto ve BES likit sayılmaz', () => {
    const e = estimate(answers({ birikim: 'b3', acil: 'a0', nerede: ['kripto', 'bes'] }))
    expect(e.liquidTl).toBeLessThan(e.assetsTl)
  })

  it('ön doldurulan profil uygulamanın rota motoruyla çalışır', () => {
    const p = seedProfile(answers())
    expect(p.monthlyIncomeKurus).toBe(7500000)
    expect(p.spending && Object.values(p.spending).reduce((s, v) => s + v, 0)).toBeGreaterThan(0)
    expect(p.age).toBeUndefined()
    const j = buildJourney(p, seedFacts(answers()), {}, { runs: 0 })
    expect(j.stages).toHaveLength(8)
  })

  it('zor durumda sisli vadiden, güçlü durumda ileriden başlar', () => {
    const low = quickResult(answers({ kalan: 'eksi', borc: 'zor', acil: 'a0', birikim: 'b0', nerede: [], yatirim: 'hayir', dusus: 'sat' }))
    expect(low.level).toBe(0)
    expect(low.place.name).toBe('Sisli Vadi')
    expect(low.archetype.name).toBe('Temkinli Kaşif')
    expect(low.insights[0].stage).toBe('balance')
    const high = quickResult(answers({ gelir: 'g5', kalan: 'iyi', borc: 'yok', acil: 'a6', birikim: 'b4', nerede: ['doviz', 'hisseFon'], yatirim: 'her_ay', dusus: 'al' }))
    expect(high.level).toBeGreaterThan(low.level)
    expect(high.reach.midMonths).not.toBeNull()
    expect(high.goalKurus).toBeGreaterThan(0)
  })

  it('ek birikim varış ayını öne çeker', () => {
    const r = quickResult(answers())
    const s = quickScenario(r, 5000)
    expect(s.base.reachMonths).not.toBeNull()
    expect(s.plus.reachMonths!).toBeLessThan(s.base.reachMonths!)
    expect(s.base.reachMonths).toBe(r.reach.midMonths)
  })

  it('devam kodu biçimi', () => {
    let i = 0
    const code = newLeadCode(() => (i++ % 10) / 10)
    expect(code).toMatch(LEAD_CODE_RE)
    expect(newLeadCode()).toMatch(LEAD_CODE_RE)
  })
  it('varış aralığı: temkinlide ulaşılamıyorsa orta senaryoya kadar', () => {
    const r = (f: number | null, m: number | null, s: number | null) => reachRange({ reach: { fastMonths: f, midMonths: m, slowMonths: s } }, 2026)
    expect(r(120, 180, 240)).toBe('2036–2046')
    expect(r(120, 180, null)).toBe('2036–2041')
    expect(r(120, null, null)).toBe('2036+')
    expect(r(null, null, null)).toBeNull()
    expect(r(5, 6, 7)).toBe('2027')
  })
})

describe('targetSplit', () => {
  const life = (dream: number, spend: number) => {
    const s = targetSplit(dream * 100, spend * 100)
    return (spend * s.pct) / 100 + (s.annualBigSpendKurus ?? 0) / 100 / 12
  }
  it('gerçek harcama değişse de hedef yaşam hayal edilen tutar kalır', () => {
    expect(life(120_000, 45_000)).toBeCloseTo(120_000, -1)
    expect(life(120_000, 60_000)).toBeCloseTo(120_000, -1)
    expect(life(60_000, 50_000)).toBeCloseTo(60_000, -1)
    expect(targetSplit(60_000_00, 50_000_00)).toEqual({ pct: 120, annualBigSpendKurus: undefined })
  })
  it('hayal bugünkü harcamanın yarısından azsa alt sınır %50', () => {
    expect(targetSplit(20_000_00, 100_000_00)).toEqual({ pct: 50, annualBigSpendKurus: undefined })
  })
})
