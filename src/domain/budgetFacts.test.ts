import { describe, expect, it } from 'vitest'
import { debtRecurring, type Asset } from './assets'
import { budgetFacts, collectFixedLines, READ_LOCKED_DATA, type FactsGates, type FactsInput } from './budgetFacts'
import { buildBucketBudget, fixedSpendSplit, toAutoBudget, type BucketInput, type FixedLine } from './bucketBudget'
import type { SavingsGoal } from './goals'
import { personalCycleDay } from './income'
import type { JourneyProfile } from './journey'
import { merchantKey } from './normalize'
import type { BudgetProfile, RecurringIncome, RecurringPayment, Settings, Transaction } from './types'
import { buildDefaultCategories } from '../data/seed'

// Örnek hesap (şartname §8): bugün Pzt 12 Eki 2026; maaş 60.000, her ayın 15'i → dönem 15 Eyl – 14 Eki
const TODAY = '2026-10-12'
const NOW = '2026-10-12T09:00:00.000Z'
const tl = (lira: number) => Math.round(lira * 100)

const FREE: FactsGates = { recurring: READ_LOCKED_DATA, assets: READ_LOCKED_DATA, installments: READ_LOCKED_DATA, goals: false, journey: false, detail: false }
const PLUS: FactsGates = { recurring: true, assets: true, installments: true, goals: true, journey: false, detail: true }
const PLUSPLUS: FactsGates = { ...PLUS, journey: true }
const LOCKED: FactsGates = { recurring: false, assets: false, installments: false, goals: false, journey: false, detail: false }

// saveSalary({ amountKurus: 60.000 TL, day: 15, followCycle: true }) sonucu
const salary: RecurringIncome = { id: 'inc-maas', name: 'Maaş', kind: 'salary', amountKurus: tl(60_000), cadence: 'monthly', startDate: '2026-09-15', active: true, createdAt: NOW, updatedAt: NOW }
const profile = (o: Partial<BudgetProfile> = {}): BudgetProfile => ({ updatedAt: NOW, ...o })
// Ücretsiz yoldaki kısa beyan
const FREE_PROFILE = profile({ housing: 'rent', housingKurus: tl(18_000), billsKurus: tl(3_000), cardPaymentKurus: tl(4_000), consumerDebtKurus: tl(20_000), emergencyFundKurus: 0 })

const settingsOf = (o: Partial<Settings> = {}): Settings => ({ id: 'settings', monthlyBudgetKurus: null, recurringIncomes: [salary], cycleSource: 'salary', updatedAt: NOW, ...o })
const categories = buildDefaultCategories(NOW)

const input = (o: Partial<FactsInput> = {}): FactsInput => {
  const settings = o.settings ?? settingsOf()
  return { txs: [], settings, recurring: [], assets: [], goals: [], categories, startDay: personalCycleDay(settings), today: TODAY, gates: FREE, ...o }
}
const facts = (o: Partial<FactsInput> = {}) => budgetFacts(input(o))!
const keys = (lines: FixedLine[]) => lines.map((l) => l.key)
const line = (f: BucketInput, key: string) => f.fixed.find((l) => l.key === key)

let seq = 0
const rec = (o: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: `r${++seq}`,
  name: 'Ödeme',
  kind: 'bill',
  amountKurus: tl(1_000),
  categoryId: null,
  cadence: 'monthly',
  startDate: '2026-01-01',
  reminderDays: 3,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '',
  ...o,
})
const rent = (o: Partial<RecurringPayment> = {}) => rec({ id: 'kira', name: 'Kira', amountKurus: tl(18_000), categoryId: 'cat-kira', ...o })
const billsRec = (o: Partial<RecurringPayment> = {}) => rec({ id: 'fatura', name: 'Faturalar', amountKurus: tl(3_000), categoryId: 'cat-faturalar', ...o })

/** Bakiye türü varlık (TL miktar × 1 TL). */
const holding = (kind: Asset['kind'], lira: number, o: Partial<Asset> = {}): Asset => ({
  id: `a${++seq}`,
  kind,
  name: kind,
  unit: 'TL',
  trades: [{ id: `tr${seq}`, date: '2026-01-01', side: 'buy', quantity: lira, unitPriceKurus: 100 }],
  valuations: [],
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '',
  ...o,
})
const debt = (type: NonNullable<Asset['debtType']>, lira: number, o: Partial<Asset> = {}) => holding('debt', lira, { name: type, debtType: type, ...o })
const card = (o: Partial<Asset> = {}) => debt('card', 20_000, { id: 'kart', name: 'Kredi kartı', debtTerms: { monthlyRatePct: 4.25, minPaymentKurus: tl(4_000) }, ...o })

const tx = (date: string, lira: number, o: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  date,
  amountKurus: tl(lira),
  type: 'expense',
  description: 'Harcama',
  normalizedDescription: 'harcama',
  categoryId: null,
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...o,
})
// Tamamlanmış üç dönem (startDay 15): 15 Haz–14 Tem, 15 Tem–14 Ağu, 15 Ağu–14 Eyl
const PAST = ['2026-06-20', '2026-07-20', '2026-08-20']
const everyPeriod = (lira: number, o: Partial<Transaction>) => PAST.map((d) => tx(d, lira, o))

const autoOf = (f: BucketInput) => {
  const b = buildBucketBudget(f)!
  const { recurringKurus, debtKurus } = fixedSpendSplit(f.fixed)
  return { b, auto: toAutoBudget(b, f.income.source, f.goalsKurus, recurringKurus, debtKurus) }
}

describe('örnek hesap (§8): Ücretsiz yol, kısa beyan', () => {
  const f = facts({ settings: settingsOf({ budgetProfile: FREE_PROFILE }) })

  it('girdiler', () => {
    expect(READ_LOCKED_DATA).toBe(true)
    expect(f.income).toMatchObject({ monthlyKurus: tl(60_000), source: 'plan', oneOffKurus: 0, reservedKurus: 0 })
    expect(f.fixed).toEqual([
      { key: 'profile:housingKurus', label: 'Kira ve aidat', kind: 'housing', monthlyKurus: tl(18_000), periodKurus: tl(18_000), housing: true, consumer: false, inSpending: true, source: 'profile' },
      { key: 'profile:billsKurus', label: 'Faturalar', kind: 'bill', monthlyKurus: tl(3_000), periodKurus: tl(3_000), housing: false, consumer: false, inSpending: true, source: 'profile' },
      { key: 'profile:cardPaymentKurus', label: 'Kart asgari ve KMH ödemesi', kind: 'debt', monthlyKurus: tl(4_000), periodKurus: tl(4_000), housing: false, consumer: true, inSpending: false, source: 'profile' },
    ])
    expect(f.consumerBalanceKurus).toBe(tl(20_000))
    expect(f.liquidKurus).toBe(0)
    expect(f.goalsKurus).toBe(0)
    expect(f.household).toEqual({ stability: 'regular', dependents: 0, earners: null })
    expect(f.history).toBeNull()
    expect(f.journeySpending).toBeNull()
    expect(f.payday).toEqual({ nominal: '2026-10-15', date: '2026-10-15', shifted: false })
    expect(f.periodDays).toBe(30)
    expect(f.detail).toBe(false)
  })

  it('kovalar 25.000 / 20.000 / 6.000 / 9.000; harcama bütçesi 47.000', () => {
    const { b, auto } = autoOf(f)
    expect([b.buckets.fixed.kurus, b.buckets.needs.kurus, b.buckets.wants.kurus, b.buckets.saving.kurus]).toEqual([tl(25_000), tl(20_000), tl(6_000), tl(9_000)])
    expect(b.alert).toBeNull()
    expect(b.destinations).toMatchObject({ stage: 'starter', monthsToStage: 5 })
    expect(auto).toMatchObject({
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
      weeklyKurus: null,
      categoryLimits: {},
    })
    expect(auto.recurringKurus + auto.debtKurus + auto.flexibleKurus).toBe(auto.totalKurus)
    // Harcama + kart + birikim = gelir
    expect(auto.totalKurus + b.outsideKurus + auto.savingKurus).toBe(tl(60_000))
  })
})

describe('örnek hesap (§8): Plus yolu, ayrıntılı kayıtlar aynı sonucu verir', () => {
  const plus = (today = TODAY) =>
    facts({ settings: settingsOf({ budgetProfile: profile({ emergencyFundKurus: 0 }) }), recurring: [rent(), billsRec()], assets: [card()], gates: PLUS, today })

  it('satırlar: kira konut, fatura, kart asgarisi bütçe dışında', () => {
    const f = plus()
    expect(keys(f.fixed)).toEqual(['rec:kira', 'rec:fatura', 'debt:kart'])
    expect(f.fixed.map((l) => [l.kind, l.monthlyKurus, l.periodKurus, l.housing, l.consumer, l.inSpending])).toEqual([
      ['housing', tl(18_000), tl(18_000), true, false, true],
      ['bill', tl(3_000), tl(3_000), false, false, true],
      ['debt', tl(4_000), tl(4_000), false, true, false],
    ])
    expect(line(f, 'debt:kart')).toMatchObject({ source: 'asset', estimated: false })
    expect(f.consumerBalanceKurus).toBe(tl(20_000))
    // Yalnızca borç varlığı var: acil durum fonu beyandan
    expect(f.liquidKurus).toBe(0)
  })

  it('aynı kovalar; haftalık 6.050 ve §8 kategori limitleri', () => {
    const { b, auto } = autoOf(plus())
    expect([b.buckets.fixed.kurus, b.buckets.needs.kurus, b.buckets.wants.kurus, b.buckets.saving.kurus]).toEqual([tl(25_000), tl(20_000), tl(6_000), tl(9_000)])
    expect(auto.totalKurus).toBe(tl(47_000))
    expect(auto.recurringKurus).toBe(tl(21_000))
    expect(auto.weeklyKurus).toBe(tl(6_050))
    expect(auto.categoryLimits).toEqual({
      'cat-market': tl(8_250),
      'cat-akaryakit': tl(4_900),
      'cat-ulasim': tl(4_900),
      'cat-diger': tl(2_700),
      'cat-restoran': tl(1_650),
      'cat-saglik': tl(1_050),
    })
  })

  it('31 günlük dönemde (15 Eki – 14 Kas) haftalık 5.850', () => {
    const f = plus('2026-10-20')
    expect(f.periodDays).toBe(31)
    expect(f.income.monthlyKurus).toBe(tl(60_000))
    expect(autoOf(f).auto.weeklyKurus).toBe(tl(5_850))
  })
})

describe('sabit satırlar: kaynaklar ve öncelik', () => {
  it('düzenli ödemeler: aylık karşılık ve dönemde düşen tutar; bitmiş ve pasif olanlar yok', () => {
    const weekly = rec({ id: 'haftalik', kind: 'subscription', amountKurus: tl(100), cadence: 'weekly', startDate: '2026-09-01' })
    const yearly = rec({ id: 'sigorta', amountKurus: tl(12_000), cadence: 'yearly', startDate: '2026-10-01' })
    const done = rec({ id: 'bitti', occurrences: 3 })
    const off = rec({ id: 'pasif', active: false })
    const f = facts({ recurring: [weekly, yearly, done, off] })
    expect(keys(f.fixed)).toEqual(['rec:haftalik', 'rec:sigorta'])
    // 15, 22, 29 Eyl; 6, 13 Eki
    expect(line(f, 'rec:haftalik')).toMatchObject({ kind: 'subscription', monthlyKurus: 43_333, periodKurus: tl(500) })
    expect(line(f, 'rec:sigorta')).toMatchObject({ kind: 'bill', monthlyKurus: tl(1_000), periodKurus: tl(12_000) })
  })

  it('konut: kategorinin grubu, kategorisizse adı', () => {
    const f = facts({ recurring: [rec({ id: 'ev', name: 'Ev kirası' }), rec({ id: 'arac', name: 'Araç kiralama' }), rec({ id: 'kat', name: 'Ödeme', categoryId: 'cat-kira' })] })
    expect(f.fixed.map((l) => [l.key, l.kind, l.housing])).toEqual([
      ['rec:ev', 'housing', true],
      ['rec:arac', 'bill', false],
      ['rec:kat', 'housing', true],
    ])
  })

  it('elle eklenen taksit: borç, tüketici, bütçe içinde; kalan taksit yoksa yok', () => {
    const open = rec({ id: 'tel', kind: 'installment', amountKurus: tl(2_000), startDate: '2026-05-01', occurrences: 12 })
    const paid = rec({ id: 'eski', kind: 'installment', startDate: '2026-01-01', occurrences: 3 })
    const f = facts({ recurring: [open, paid] })
    expect(keys(f.fixed)).toEqual(['inst:tel'])
    expect(line(f, 'inst:tel')).toMatchObject({ kind: 'debt', consumer: true, inSpending: true, housing: false, monthlyKurus: tl(2_000), periodKurus: tl(2_000), source: 'recurring' })
  })

  it('debt:* kalemleri okunmaz; taksitli borç varlıktan bir kez sayılır', () => {
    const loan = debt('loan', 0, { id: 'kredi', name: 'İhtiyaç kredisi', trades: [], debtPlan: { mode: 'monthly', dueDate: '2026-10-20', installmentKurus: tl(2_500), installments: 10 } })
    const recurring = [rent(), ...debtRecurring([loan])]
    expect(recurring.map((r) => r.id)).toContain('debt:kredi')
    const f = facts({ recurring, assets: [loan] })
    expect(keys(f.fixed)).toEqual(['rec:kira', 'debt:kredi'])
    expect(line(f, 'debt:kredi')).toMatchObject({ kind: 'debt', monthlyKurus: tl(2_500), periodKurus: tl(2_500), consumer: true, inSpending: true, estimated: false })
    expect(fixedSpendSplit(f.fixed).debtKurus).toBe(tl(2_500))
  })

  it('konut kredisi hem konut hem borç; kira borç değil', () => {
    const mortgage = debt('mortgage', 0, { id: 'konut', trades: [], debtPlan: { mode: 'monthly', dueDate: '2026-10-05', installmentKurus: tl(20_000), installments: 100 } })
    const f = facts({ assets: [mortgage] })
    expect(line(f, 'debt:konut')).toMatchObject({ kind: 'debt', housing: true, consumer: false, inSpending: true })
    const b = buildBucketBudget(f)!
    expect(b.checks.housingPct).toBeCloseTo(1 / 3, 10)
    expect(b.checks.dtiPct).toBeCloseTo(1 / 3, 10)
    // Beyandaki konut kredisi de öyle
    const p = facts({ settings: settingsOf({ budgetProfile: profile({ housing: 'mortgage', housingKurus: tl(20_000) }) }) })
    expect(p.fixed).toEqual([
      { key: 'profile:housingKurus', label: 'Konut kredisi taksiti', kind: 'debt', monthlyKurus: tl(20_000), periodKurus: tl(20_000), housing: true, consumer: false, inSpending: true, source: 'profile' },
    ])
    // Kira yalnızca konut oranına girer
    const r = buildBucketBudget(facts({ recurring: [rent()] }))!
    expect(r.checks.housingPct).toBeCloseTo(0.3, 10)
    expect(r.checks.dtiPct).toBe(0)
  })

  it('kart asgarisi girilmemişse: faiz + %3 ile bakiyenin %20si arasında büyüğü', () => {
    const f = facts({ assets: [card({ debtTerms: { monthlyRatePct: 4.25, minPaymentKurus: null } })] })
    // 20.000 × %7,25 = 1.450 < 20.000 × %20 = 4.000
    expect(line(f, 'debt:kart')).toMatchObject({ monthlyKurus: tl(4_000), estimated: true, inSpending: false, consumer: true })
    // 20.000 × %23 = 4.600 > 4.000
    expect(line(facts({ assets: [card({ debtTerms: { monthlyRatePct: 20, minPaymentKurus: null } })] }), 'debt:kart')!.monthlyKurus).toBe(tl(4_600))
    // Kredide %20 tabanı yok: 20.000 × %6 = 1.200
    const loan = debt('loan', 20_000, { id: 'ihtiyac', debtTerms: { monthlyRatePct: 3, minPaymentKurus: null } })
    expect(line(facts({ assets: [loan] }), 'debt:ihtiyac')).toMatchObject({ monthlyKurus: tl(1_200), estimated: true, inSpending: true })
  })

  it('kart netleştirme: 4.000 asgari − 1.500 ekstre taksiti → 2.500', () => {
    const stmt = tx('2026-10-01', 1_500, { description: 'TEKNOSA 3/6 TAKSIT', normalizedDescription: 'teknosa 3/6 taksit', categoryId: 'cat-diger', installment: { current: 3, total: 6 } })
    const f = facts({ txs: [stmt], assets: [card()] })
    const s = f.fixed.find((l) => l.key.startsWith('stmt:'))!
    expect(s).toMatchObject({ kind: 'debt', consumer: true, inSpending: true, monthlyKurus: tl(1_500), periodKurus: tl(1_500), source: 'statement' })
    expect(line(f, 'debt:kart')).toMatchObject({ monthlyKurus: tl(2_500), periodKurus: tl(2_500) })
    // Beyandaki kart ödemesi de netleşir; toplam değişmez
    const p = facts({ txs: [stmt], settings: settingsOf({ budgetProfile: profile({ cardPaymentKurus: tl(4_000) }) }) })
    expect(line(p, 'profile:cardPaymentKurus')!.monthlyKurus).toBe(tl(2_500))
    expect(p.fixed.reduce((sum, l) => sum + l.monthlyKurus, 0)).toBe(tl(4_000))
    // Ekstre taksiti asgariden büyükse kart satırı 0'da kalır
    const big = tx('2026-10-01', 5_000, { description: 'VATAN 2/6 TAKSIT', normalizedDescription: 'vatan 2/6 taksit', installment: { current: 2, total: 6 } })
    expect(line(facts({ txs: [big], assets: [card()] }), 'debt:kart')!.monthlyKurus).toBe(0)
  })

  it('banka ücreti satırı: ücret kategorilerinin ortalamasından', () => {
    const custom = { ...categories[0], id: 'cat-ozel', name: 'Kart faizi', order: 99 }
    const f = input({ categories: [...categories, custom] })
    const lines = collectFixedLines(f, '2026-09', new Map([['cat-banka', tl(250)], ['cat-ozel', tl(50)], ['cat-market', tl(5_000)]]))
    expect(lines).toEqual([{ key: 'fee:bank', label: 'Banka ücretleri', kind: 'fee', monthlyKurus: tl(300), periodKurus: tl(300), housing: false, consumer: false, inSpending: true, source: 'history' }])
    // Geçmişten: üç dönemde 300, 200, 250 → 250
    const g = facts({ txs: [tx(PAST[0], 300, { categoryId: 'cat-banka' }), tx(PAST[1], 200, { categoryId: 'cat-banka' }), tx(PAST[2], 250, { categoryId: 'cat-banka' })] })
    expect(line(g, 'fee:bank')!.monthlyKurus).toBe(tl(250))
    // Banka ücreti ihtiyaç/istek geçmişine girmez
    expect(g.history).toEqual({ needKurus: 0, wantKurus: 0, months: 3 })
  })

  it('beyan, aynı türden ayrıntılı kayıt varsa yok sayılır', () => {
    const p = profile({ housing: 'rent', housingKurus: tl(15_000), billsKurus: tl(2_000), cardPaymentKurus: tl(3_000), loanPaymentKurus: tl(5_000) })
    const settings = settingsOf({ budgetProfile: p })
    // Ayrıntı yok: dört beyan satırı
    expect(keys(facts({ settings }).fixed)).toEqual(['profile:housingKurus', 'profile:billsKurus', 'profile:cardPaymentKurus', 'profile:loanPaymentKurus'])
    // Kira kaydı → beyandaki kira yok
    expect(keys(facts({ settings, recurring: [rent()] }).fixed)).toEqual(['rec:kira', 'profile:billsKurus', 'profile:cardPaymentKurus', 'profile:loanPaymentKurus'])
    // Abonelik de fatura türünü karşılar
    const netflix = rec({ id: 'netflix', kind: 'subscription', amountKurus: tl(200), categoryId: 'cat-abonelik' })
    expect(keys(facts({ settings, recurring: [netflix] }).fixed)).not.toContain('profile:billsKurus')
    // Kart veya KMH borcu → beyandaki kart ödemesi yok
    expect(keys(facts({ settings, assets: [card()] }).fixed)).not.toContain('profile:cardPaymentKurus')
    expect(keys(facts({ settings, assets: [debt('overdraft', 5_000, { debtTerms: { monthlyRatePct: 4, minPaymentKurus: tl(500) } })] }).fixed)).not.toContain('profile:cardPaymentKurus')
    // Taksit, ekstre taksiti ya da kredi borcu → beyandaki kredi taksiti yok
    const inst = rec({ id: 'tel', kind: 'installment', startDate: '2026-05-01', occurrences: 12 })
    expect(keys(facts({ settings, recurring: [inst] }).fixed)).not.toContain('profile:loanPaymentKurus')
    const stmt = tx('2026-10-01', 1_500, { description: 'TEKNOSA 3/6 TAKSIT', installment: { current: 3, total: 6 } })
    expect(keys(facts({ settings, txs: [stmt] }).fixed)).not.toContain('profile:loanPaymentKurus')
    for (const type of ['loan', 'auto', 'personal'] as const)
      expect(keys(facts({ settings, assets: [debt(type, 10_000, { debtTerms: { monthlyRatePct: 0, minPaymentKurus: tl(1_000) } })] }).fixed)).not.toContain('profile:loanPaymentKurus')
    // Kart borcu kredi beyanını engellemez
    expect(keys(facts({ settings, assets: [card()] }).fixed)).toContain('profile:loanPaymentKurus')
  })

  it('beyanda 0 da girilmiş sayılır: satır olmaz, Yolculuk testine düşülmez', () => {
    const journey = journeyProfile({ housing: 'rent' })
    const settings = settingsOf({ journey, budgetProfile: profile({ housingKurus: 0, billsKurus: 0 }) })
    expect(facts({ settings, gates: PLUSPLUS }).fixed).toEqual([])
  })
})

const SPENDING = { housing: tl(15_000), food: tl(10_000), transport: tl(5_000), bills: tl(2_500), fun: tl(4_000), other: tl(3_880) }
const journeyProfile = (o: Partial<JourneyProfile> = {}): JourneyProfile => ({
  goal: 'independence',
  horizonYears: 20,
  targetMonthlyExpenseKurus: tl(40_000),
  monthlyIncomeKurus: tl(50_000),
  essentialMonthlyKurus: tl(30_000),
  incomeStability: 'variable',
  priorities: [],
  withdrawalRatePct: 3.5,
  celebrated: [],
  confirmedAt: NOW,
  dependents: 2,
  housing: 'rent',
  spending: SPENDING,
  ...o,
})

describe('Yolculuk testi (Plus+): konut ve faturalar için son çare', () => {
  it('kira ve faturalar sabit satır; ihtiyaçların başlangıcı harcamadan', () => {
    const f = facts({ settings: settingsOf({ journey: journeyProfile() }), gates: PLUSPLUS })
    expect(f.fixed).toEqual([
      { key: 'journey:housing', label: 'Kira', kind: 'housing', monthlyKurus: tl(15_000), periodKurus: tl(15_000), housing: true, consumer: false, inSpending: true, source: 'journey' },
      { key: 'journey:bills', label: 'Faturalar ve abonelikler', kind: 'bill', monthlyKurus: tl(2_500), periodKurus: tl(2_500), housing: false, consumer: false, inSpending: true, source: 'journey' },
    ])
    expect(f.journeySpending).toEqual(SPENDING)
    // 10.000 + 5.000 + 3.880 × 400/1940 = 15.800
    expect(buildBucketBudget(f)!.needs.priorKurus).toBe(tl(15_800))
    expect(f.household).toEqual({ stability: 'variable', dependents: 2, earners: null })
  })

  it('konut kredisi: borç ve konut', () => {
    const f = facts({ settings: settingsOf({ journey: journeyProfile({ housing: 'mortgage' }) }), gates: PLUSPLUS })
    expect(line(f, 'journey:housing')).toMatchObject({ label: 'Konut kredisi taksiti', kind: 'debt', housing: true, consumer: false })
  })

  it('ev sahibi veya aile yanında: konut satırı yok; beyandaki konut durumu önce gelir', () => {
    expect(keys(facts({ settings: settingsOf({ journey: journeyProfile({ housing: 'owned' }) }), gates: PLUSPLUS }).fixed)).toEqual(['journey:bills'])
    const s = settingsOf({ journey: journeyProfile({ housing: 'rent' }), budgetProfile: profile({ housing: 'family' }) })
    expect(keys(facts({ settings: s, gates: PLUSPLUS }).fixed)).toEqual(['journey:bills'])
  })

  it('beyan ve kayıt Yolculuk testinden önce gelir', () => {
    const s = settingsOf({ journey: journeyProfile(), budgetProfile: profile({ housingKurus: tl(12_000) }) })
    expect(keys(facts({ settings: s, gates: PLUSPLUS }).fixed)).toEqual(['profile:housingKurus', 'journey:bills'])
    expect(keys(facts({ settings: settingsOf({ journey: journeyProfile() }), recurring: [billsRec()], gates: PLUSPLUS }).fixed)).toEqual(['rec:fatura', 'journey:housing'])
  })

  it('kapalıyken (Plus) Yolculuk testi hiç okunmaz', () => {
    const f = facts({ settings: settingsOf({ journey: journeyProfile() }), gates: PLUS })
    expect(f.fixed).toEqual([])
    expect(f.journeySpending).toBeNull()
    expect(f.household).toEqual({ stability: 'regular', dependents: 0, earners: null })
    expect(buildBucketBudget(f)!.needs.priorKurus).toBe(tl(21_792))
  })

  it('gelir yalnızca Yolculuk testinden: kapı kapalıysa bütçe yok', () => {
    const s = settingsOf({ recurringIncomes: [], cycleSource: undefined, journey: journeyProfile({ passiveIncomeKurus: tl(5_000) }) })
    expect(facts({ settings: s, gates: PLUSPLUS }).income).toMatchObject({ monthlyKurus: tl(55_000), source: 'journey' })
    expect(budgetFacts(input({ settings: s, gates: PLUS }))).toBeNull()
  })

  it('hane bilgisi: beyan Yolculuk testinden önce gelir', () => {
    const s = settingsOf({ journey: journeyProfile({ dependents: 2 }), budgetProfile: profile({ dependents: 0, earners: 2 }) })
    expect(facts({ settings: s, gates: PLUSPLUS }).household).toEqual({ stability: 'variable', dependents: 0, earners: 2 })
  })
})

describe('geçmiş ve netleştirme', () => {
  // Her dönem: kira 18.000, IKEA 1.500 (Kira/Ev), market 9.000, kafe 3.000
  const history = [
    ...everyPeriod(18_000, { description: 'EV SAHIBI KIRA', normalizedDescription: 'ev sahibi kira', categoryId: 'cat-kira' }),
    ...everyPeriod(1_500, { description: 'IKEA', normalizedDescription: 'ikea', categoryId: 'cat-kira' }),
    ...everyPeriod(9_000, { description: 'MIGROS', normalizedDescription: 'migros', categoryId: 'cat-market' }),
    ...everyPeriod(3_000, { description: 'KAFE', normalizedDescription: 'kafe', categoryId: 'cat-restoran' }),
  ]

  it('iş yeri anahtarı olmayan kira, Kira/Ev ortalamasından düşülür; kalan ihtiyaçlara sayılır', () => {
    const f = facts({ txs: history, recurring: [rent()] })
    expect(f.history).toEqual({ needKurus: tl(10_500), wantKurus: tl(3_000), months: 3 })
  })

  it('iş yeri anahtarlı kira ortalamaya hiç girmez, ikinci kez düşülmez', () => {
    const key = merchantKey('EV SAHIBI KIRA')
    expect(key).not.toBe('')
    const f = facts({ txs: history, recurring: [rent({ matchKey: key })] })
    expect(f.history).toEqual({ needKurus: tl(10_500), wantKurus: tl(3_000), months: 3 })
  })

  it('beyandaki kira Kira/Ev ortalamasından düşülür', () => {
    const f = facts({ txs: history, settings: settingsOf({ budgetProfile: profile({ housingKurus: tl(18_000) }) }) })
    expect(f.history!.needKurus).toBe(tl(10_500))
  })

  it('beyandaki faturalar önce Faturalar, kalanı Abonelikler ortalamasından düşülür', () => {
    const txs = [...everyPeriod(2_000, { categoryId: 'cat-faturalar' }), ...everyPeriod(1_500, { categoryId: 'cat-abonelik' }), ...everyPeriod(9_000, { categoryId: 'cat-market' })]
    const f = facts({ txs, settings: settingsOf({ budgetProfile: profile({ billsKurus: tl(3_000) }) }), gates: PLUS })
    expect(f.history).toEqual({ needKurus: tl(9_000), wantKurus: tl(500), months: 3 })
    const byId = Object.fromEntries(f.candidates.map((c) => [c.id, c]))
    expect(byId['cat-faturalar']).toMatchObject({ historyKurus: 0, priorBp: 0 })
    expect(byId['cat-abonelik'].historyKurus).toBe(tl(500))
    expect(byId['cat-market'].historyKurus).toBe(tl(9_000))
  })

  it('kategorili düzenli ödeme kendi kategorisinden düşülür (taban 0)', () => {
    const txs = everyPeriod(150, { categoryId: 'cat-abonelik' })
    const netflix = rec({ id: 'netflix', kind: 'subscription', amountKurus: tl(200), categoryId: 'cat-abonelik' })
    const f = facts({ txs, recurring: [netflix] })
    expect(f.history).toEqual({ needKurus: 0, wantKurus: 0, months: 3 })
  })

  it('geçmiş yoksa null; bir dönem geçmiş ağırlığı 1/3', () => {
    expect(facts().history).toBeNull()
    const f = facts({ txs: [tx(PAST[2], 17_000, { categoryId: 'cat-market' })] })
    expect(f.history).toEqual({ needKurus: tl(17_000), wantKurus: 0, months: 1 })
    expect(buildBucketBudget(f)!.needs.historyWeight).toBeCloseTo(1 / 3, 10)
  })

  it('limit adayları: ihtiyaç ve istek kategorileri; Kira/Ev, banka ve arşivli yok; özel kategori adından', () => {
    const kres = { ...categories[0], id: 'cat-kres', name: 'Kreş', order: 20 }
    const old = { ...categories[0], id: 'cat-eski', name: 'Eski', order: 21, archived: true }
    const f = facts({ categories: [...categories, kres, old], gates: PLUS })
    const ids = f.candidates.map((c) => c.id)
    expect(ids).not.toContain('cat-kira')
    expect(ids).not.toContain('cat-banka')
    expect(ids).not.toContain('cat-eski')
    expect(f.candidates.find((c) => c.id === 'cat-kres')).toEqual({ id: 'cat-kres', bucket: 'need', priorBp: 0, historyKurus: 0, order: 20 })
    expect(f.candidates.find((c) => c.id === 'cat-market')).toEqual({ id: 'cat-market', bucket: 'need', priorBp: 1730, historyKurus: 0, order: 0 })
    // Fatura satırı yokken Faturalar TÜİK payını alır
    expect(f.candidates.find((c) => c.id === 'cat-faturalar')!.priorBp).toBe(360)
    expect(ids).toHaveLength(13)
  })
})

describe('birikim, borç bakiyesi ve hane', () => {
  it('acil durum fonu yalnızca mevduat ve nakit', () => {
    const p = settingsOf({ budgetProfile: profile({ emergencyFundKurus: tl(99_000) }) })
    const stock = holding('stock', 0, { trades: [{ id: 's', date: '2026-01-01', side: 'buy', quantity: 10, unitPriceKurus: tl(5_000) }] })
    expect(facts({ settings: p, assets: [holding('deposit', 10_000), holding('cash', 2_000), stock, holding('deposit', 7_000, { archived: true })] }).liquidKurus).toBe(tl(12_000))
    // Varlık girilmişse beyan okunmaz
    expect(facts({ settings: p, assets: [stock] }).liquidKurus).toBe(0)
    // Yalnızca borç varsa beyan
    expect(facts({ settings: p, assets: [card()] }).liquidKurus).toBe(tl(99_000))
    expect(facts().liquidKurus).toBeNull()
  })

  it('tüketici borcu: kart, KMH ve faizli kredi; kayıt yoksa beyan', () => {
    const assets = [
      card(),
      debt('overdraft', 5_000, { debtTerms: { monthlyRatePct: 4, minPaymentKurus: tl(500) } }),
      debt('loan', 10_000, { debtTerms: { monthlyRatePct: 3, minPaymentKurus: tl(1_000) } }),
      debt('personal', 7_000, { debtTerms: { monthlyRatePct: 0, minPaymentKurus: tl(700) } }),
      debt('mortgage', 500_000, { debtTerms: { monthlyRatePct: 2, minPaymentKurus: tl(15_000) } }),
      debt('card', 9_000, { archived: true }),
    ]
    const p = settingsOf({ budgetProfile: profile({ consumerDebtKurus: tl(50_000) }) })
    expect(facts({ settings: p, assets }).consumerBalanceKurus).toBe(tl(35_000))
    expect(facts({ settings: p, assets: [assets[3]] }).consumerBalanceKurus).toBe(tl(50_000))
    expect(facts().consumerBalanceKurus).toBe(0)
  })

  it('hedefler yalnızca kapı açıkken: aylık gereken tutar', () => {
    const goal: SavingsGoal = { id: 'g', name: 'Tatil', icon: 'plane', color: '#000', targetKurus: tl(12_000), targetDate: '2027-09-30', contributions: [], archived: false, createdAt: NOW, updatedAt: NOW }
    const done: SavingsGoal = { ...goal, id: 'g2', contributions: [{ id: 'c', date: '2026-10-01', amountKurus: tl(12_000) }] }
    expect(facts({ goals: [goal, done], gates: FREE }).goalsKurus).toBe(0)
    expect(facts({ goals: [goal, done], gates: PLUS }).goalsKurus).toBe(tl(1_000))
    expect(facts({ goals: [{ ...goal, archived: true }], gates: PLUS }).goalsKurus).toBe(0)
  })

  it('gelir düzeni: maaş varsa düzenli, yalnızca kayıtlardan geliyorsa değişken', () => {
    expect(facts().household.stability).toBe('regular')
    const s = settingsOf({ recurringIncomes: [], cycleSource: undefined })
    const f = facts({ settings: s, txs: [tx('2026-10-05', 40_000, { type: 'income' })] })
    expect(f.income.source).toBe('records')
    expect(f.household.stability).toBe('variable')
    expect(f.payday).toBeNull()
  })

  it('gelir hiç yoksa null', () => {
    expect(budgetFacts(input({ settings: settingsOf({ recurringIncomes: [], cycleSource: undefined }) }))).toBeNull()
  })

  it('hafta sonuna denk gelen maaş günü: önceki Cuma', () => {
    expect(facts({ today: '2026-11-12' }).payday).toEqual({ nominal: '2026-11-15', date: '2026-11-13', shifted: true })
  })
})

describe('paket kapıları', () => {
  const settings = settingsOf({ budgetProfile: profile({ housingKurus: tl(10_000), billsKurus: tl(1_000), cardPaymentKurus: tl(2_000), loanPaymentKurus: tl(3_000), consumerDebtKurus: tl(8_000), emergencyFundKurus: tl(4_000) }) })
  const stmt = tx('2026-10-01', 1_500, { description: 'TEKNOSA 3/6 TAKSIT', installment: { current: 3, total: 6 } })
  const all = {
    settings,
    txs: [stmt],
    recurring: [rent(), billsRec(), rec({ id: 'tel', kind: 'installment', startDate: '2026-05-01', occurrences: 12 })],
    assets: [card(), holding('deposit', 30_000)],
  }

  it('veri kapıları kapalıysa kayıt satırları yok, beyan kullanılır', () => {
    const f = facts({ ...all, gates: LOCKED })
    expect(keys(f.fixed)).toEqual(['profile:housingKurus', 'profile:billsKurus', 'profile:cardPaymentKurus', 'profile:loanPaymentKurus'])
    expect(f.consumerBalanceKurus).toBe(tl(8_000))
    expect(f.liquidKurus).toBe(tl(4_000))
    expect(f.detail).toBe(false)
  })

  it('Ücretsizde girilmiş veri okunur (READ_LOCKED_DATA)', () => {
    const f = facts({ ...all, gates: FREE })
    expect(keys(f.fixed)).toEqual(['rec:kira', 'rec:fatura', 'inst:tel', expect.stringMatching(/^stmt:/), 'debt:kart'])
    expect(line(f, 'debt:kart')!.monthlyKurus).toBe(tl(2_500))
    expect(f.consumerBalanceKurus).toBe(tl(20_000))
    expect(f.liquidKurus).toBe(tl(30_000))
    expect(f.goalsKurus).toBe(0)
    // Ücretsizde de kova bütçesi kurulur; limitler ve haftalık yok
    const b = buildBucketBudget(f)!
    expect(b.spendKurus).toBeGreaterThan(0)
    expect(b.categoryLimits).toEqual({})
    expect(b.weeklyKurus).toBeNull()
  })

  it('kapılar tek tek', () => {
    const only = (g: Partial<FactsGates>) => keys(facts({ ...all, gates: { ...LOCKED, ...g } }).fixed)
    expect(only({ recurring: true })).toEqual(['rec:kira', 'rec:fatura', 'profile:cardPaymentKurus', 'profile:loanPaymentKurus'])
    expect(only({ installments: true })).toEqual(['inst:tel', expect.stringMatching(/^stmt:/), 'profile:housingKurus', 'profile:billsKurus', 'profile:cardPaymentKurus'])
    expect(only({ assets: true })).toEqual(['debt:kart', 'profile:housingKurus', 'profile:billsKurus', 'profile:loanPaymentKurus'])
  })
})

describe('kayıtlardan gelir, sabit gider yok (paketler e2e yolu)', () => {
  it('40.000 → ihtiyaç 14.500, istek 12.000, birikim 13.500, bütçe 26.500', () => {
    const s: Settings = { id: 'settings', monthlyBudgetKurus: null, updatedAt: NOW }
    const f = facts({ settings: s, txs: [tx('2026-10-05', 40_000, { type: 'income' })], gates: PLUS })
    expect(f.income).toMatchObject({ monthlyKurus: tl(40_000), source: 'records', oneOffKurus: 0 })
    expect(f.fixed).toEqual([])
    const { b, auto } = autoOf(f)
    expect([b.buckets.needs.kurus, b.buckets.wants.kurus, b.buckets.saving.kurus]).toEqual([tl(14_500), tl(12_000), tl(13_500)])
    expect(auto.totalKurus).toBe(tl(26_500))
    expect(auto.incomeSource).toBe('records')
    expect(auto.weeklyKurus).toBe(tl(5_950))
  })
})
