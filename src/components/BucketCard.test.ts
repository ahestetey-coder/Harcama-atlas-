import { describe, expect, it } from 'vitest'
import type { Asset } from '../domain/assets'
import { budgetFacts, READ_LOCKED_DATA, type FactsGates, type FactsInput } from '../domain/budgetFacts'
import { buildBucketBudget, fixedSpendSplit, toAutoBudget, type BucketBudget, type BucketInput, type FixedLine } from '../domain/bucketBudget'
import { personalCycleDay } from '../domain/income'
import { formatKurus } from '../domain/money'
import type { BudgetProfile, RecurringIncome, RecurringPayment, Settings } from '../domain/types'
import { buildDefaultCategories } from '../data/seed'
import { bucketAlert, bucketAriaLabel, bucketChip, bucketHeadline, mainDestination, pctText, stageText } from './BucketCard'
import { detailedCoverage } from './FixedCostsDialog'

// Örnek hesap (şartname §8): bugün Pzt 12 Eki 2026; net maaş 60.000, her ayın 15'i
const TODAY = '2026-10-12'
const NOW = '2026-10-12T09:00:00.000Z'
const tl = (lira: number) => Math.round(lira * 100)

const FREE: FactsGates = { recurring: READ_LOCKED_DATA, assets: READ_LOCKED_DATA, installments: READ_LOCKED_DATA, goals: false, journey: false, detail: false }
const PLUS: FactsGates = { recurring: true, assets: true, installments: true, goals: true, journey: false, detail: true }

const salary: RecurringIncome = { id: 'inc-maas', name: 'Maaş', kind: 'salary', amountKurus: tl(60_000), cadence: 'monthly', startDate: '2026-09-15', active: true, createdAt: NOW, updatedAt: NOW }
const profile = (o: Partial<BudgetProfile> = {}): BudgetProfile => ({ updatedAt: NOW, ...o })
const FREE_PROFILE = profile({ housing: 'rent', housingKurus: tl(18_000), billsKurus: tl(3_000), cardPaymentKurus: tl(4_000), consumerDebtKurus: tl(20_000), emergencyFundKurus: 0 })
const settingsOf = (o: Partial<Settings> = {}): Settings => ({ id: 'settings', monthlyBudgetKurus: null, recurringIncomes: [salary], cycleSource: 'salary', updatedAt: NOW, ...o })
const categories = buildDefaultCategories(NOW)

const input = (o: Partial<FactsInput> = {}): FactsInput => {
  const settings = o.settings ?? settingsOf()
  return { txs: [], settings, recurring: [], assets: [], goals: [], categories, startDay: personalCycleDay(settings), today: TODAY, gates: FREE, ...o }
}

/** Sayfadaki zincir: budgetFacts → buildBucketBudget → toAutoBudget (useAutoBudget ile aynı). */
const card = (o: Partial<FactsInput> = {}) => {
  const f = budgetFacts(input(o))!
  const b = buildBucketBudget(f)!
  const { recurringKurus, debtKurus } = fixedSpendSplit(f.fixed)
  return { b, auto: toAutoBudget(b, f.income.source, f.goalsKurus, recurringKurus, debtKurus) }
}

const rec = (o: Partial<RecurringPayment>): RecurringPayment => ({
  id: 'r',
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
const debtAsset = (o: Partial<Asset>): Asset => ({
  id: 'kart',
  kind: 'debt',
  name: 'Kredi kartı',
  unit: 'TL',
  trades: [{ id: 'tr-kart', date: '2026-01-01', side: 'buy', quantity: 20_000, unitPriceKurus: 100 }],
  valuations: [],
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '',
  debtType: 'card',
  debtTerms: { monthlyRatePct: 4.25, minPaymentKurus: tl(4_000) },
  ...o,
})

// Motor varyantları için doğrudan girdi (bucketBudget.test.ts ile aynı kurgu)
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
const rent = (lira: number) => line('profile:housingKurus', 'housing', lira, { housing: true })
const bills = (lira: number) => line('profile:billsKurus', 'bill', lira)
const cardPay = (lira: number) => line('profile:cardPaymentKurus', 'debt', lira, { consumer: true, inSpending: false })
const engine = (incomeLira: number, fixed: FixedLine[], over: Partial<BucketInput> = {}): BucketBudget =>
  buildBucketBudget({
    income: { monthlyKurus: tl(incomeLira), source: 'plan', plannedKurus: tl(incomeLira), irregularKurus: 0, oneOffKurus: 0, reservedKurus: 0, upcoming: [], salaryUpdateKurus: null, confidence: 'high' },
    fixed,
    consumerBalanceKurus: tl(20_000),
    goalsKurus: 0,
    liquidKurus: 0,
    household: { stability: 'regular', dependents: 0, earners: null },
    journeySpending: null,
    candidates: [],
    history: null,
    payday: { nominal: '2026-10-15', date: '2026-10-15', shifted: false },
    detail: false,
    periodDays: 30,
    ...over,
  })!

describe('kova kartı: örnek hesap (§8), Ücretsiz yol', () => {
  const { b, auto } = card({ settings: settingsOf({ budgetProfile: FREE_PROFILE }) })

  it('dört satır ₺ ve % ile; çubuğun ekran okuyucu metni', () => {
    expect([b.buckets.fixed, b.buckets.needs, b.buckets.wants, b.buckets.saving].map((x) => `${formatKurus(x.kurus)} · ${pctText(x.pct)}`)).toEqual([
      '25.000,00 ₺ · %41,7',
      '20.000,00 ₺ · %33,3',
      '6.000,00 ₺ · %10',
      '9.000,00 ₺ · %15',
    ])
    expect(bucketAriaLabel(b)).toBe('Dağılım: zorunlu sabitler %41,7, ihtiyaçlar %33,3, istekler %10, birikim ve borç %15')
  })

  it('başlık: maaş günü ve birikim; uyarı yok', () => {
    expect(bucketHeadline(b)).toBe('15 Ekim, Perşembe: önce 9.000,00 ₺ birikime ayırın.')
    expect(bucketAlert(b)).toBeNull()
  })

  it('birikim acil durum fonuna; başlangıç fonu 5 maaş gününde', () => {
    expect(mainDestination(b)).toBe('acil durum fonu')
    expect(stageText(b)).toBe('1 aylık fon, yaklaşık 5 maaş günü')
    expect(b.emergency).toMatchObject({ essentialKurus: tl(45_000), minMonths: 3, maxMonths: 6 })
  })

  it('"Bu bütçeyi kullan" 47.000 yazar; kart asgarisi bütçe dışında', () => {
    expect(b.spendKurus).toBe(tl(47_000))
    expect(auto.totalKurus).toBe(tl(47_000))
    expect(formatKurus(b.spendKurus)).toBe('47.000,00 ₺')
    expect(b.outsideKurus).toBe(tl(4_000))
  })

  it('öneri yok: konut var, döngü maaşa bağlı', () => {
    expect(bucketChip(b, settingsOf({ budgetProfile: FREE_PROFILE }))).toBeNull()
  })

  it('tek kişilik hanede acil durum fonu 6–9 ay', () => {
    const one = card({ settings: settingsOf({ budgetProfile: { ...FREE_PROFILE, earners: 1 } }) }).b
    expect(one.emergency).toMatchObject({ minMonths: 6, maxMonths: 9 })
  })
})

describe('kova kartı: uyarı metinleri (§8 varyantları)', () => {
  it('kart asgarisi 14.000 → kart ve kredi %23,3', () => {
    const b = engine(60_000, [rent(18_000), bills(3_000), cardPay(14_000)])
    expect(bucketAlert(b)).toEqual({ tone: 'warning', text: 'Kart ve kredi ödemeleri: gelirin %23,3 · önerilen en fazla %20.' })
  })

  it('gelir 150.000, kart 32.000 → isteklerden 1.900 borca', () => {
    const b = engine(150_000, [rent(18_000), bills(3_000), cardPay(32_000)])
    expect(b.buckets.saving.kurus).toBe(tl(31_900))
    expect(bucketAlert(b)?.text).toBe('Kart ve kredi ödemeleri: gelirin %21,3 · önerilen en fazla %20. İsteklerden 1.900,00 ₺ borca ayrıldı.')
  })

  it('düşük gelir 30.000 → konut %40', () => {
    const b = engine(30_000, [rent(12_000), bills(3_000), cardPay(2_000)])
    expect(bucketAlert(b)?.text).toBe('Konut gideri: gelirin %40 · önerilen en fazla %30.')
  })

  it('açık 5.000 → başlık ve tehlike uyarısı', () => {
    const b = engine(60_000, [rent(30_000), bills(3_000), cardPay(12_000)])
    expect(bucketHeadline(b)).toBe('Giderleriniz gelirinizi 5.000,00 ₺ aşıyor.')
    expect(bucketAlert(b)).toEqual({ tone: 'danger', text: 'Giderleriniz gelirinizi 5.000,00 ₺ aşıyor; bu ay istek ve birikim ayrılmadı.' })
    // Çubuk F + N'ye göre ölçeklenir; yüzdeler gelire göre
    expect(bucketAriaLabel(b)).toBe('Dağılım: zorunlu sabitler %75, ihtiyaçlar %33,3, istekler %0, birikim ve borç %0')
  })

  it('borç oranı %36 üstü', () => {
    const b = engine(60_000, [rent(12_000), line('profile:loanPaymentKurus', 'debt', 22_000)], { consumerBalanceKurus: 0 })
    expect(bucketAlert(b)?.text).toBe('Borç ödemeleri: gelirin %36,7 · önerilen en fazla %36.')
  })

  it('yalnızca birikim düşük', () => {
    const b = engine(60_000, [rent(18_000), bills(3_000), line('debt:vergi', 'debt', 12_000)], { consumerBalanceKurus: 0 })
    expect(b.broken).toEqual(['saving'])
    expect(bucketAlert(b)?.text).toBe("Birikim: gelirin %5 · önce %10'a çıkarmayı hedefleyin.")
  })

  it('maaş hafta sonuna denk gelirse Cuma ve not', () => {
    const b = engine(60_000, [rent(18_000), bills(3_000), cardPay(4_000)], { payday: { nominal: '2026-11-15', date: '2026-11-13', shifted: true } })
    expect(bucketHeadline(b)).toBe('13 Kasım, Cuma: önce 9.000,00 ₺ birikime ayırın (maaş hafta sonuna denk geliyor).')
  })

  it('başlangıç fonu tamamsa birikim kart borcuna', () => {
    const b = engine(60_000, [rent(18_000), bills(3_000), cardPay(4_000)], { liquidKurus: tl(45_000) })
    expect(b.destinations.stage).toBe('debt')
    expect(mainDestination(b)).toBe('kart ve kredi borcu')
  })

  it('birikim bilinmiyorsa aşama yok', () => {
    const b = engine(60_000, [rent(18_000)], { liquidKurus: null })
    expect(stageText(b)).toBeNull()
    expect(mainDestination(b)).toBe('acil durum fonu')
  })
})

describe('kova kartı: tek öneri', () => {
  const noHousing = engine(60_000, [bills(3_000)])
  const withHousing = engine(60_000, [rent(18_000), bills(3_000)])

  it('konut yoksa önce sabit giderler', () => {
    expect(bucketChip(noHousing, settingsOf({ cycleSource: undefined }))).toBe('housing')
  })

  it('konut 0 beyan edildiyse ya da ev sahibiyse sorulmaz', () => {
    expect(bucketChip(noHousing, settingsOf({ budgetProfile: profile({ housingKurus: 0 }) }))).toBeNull()
    expect(bucketChip(noHousing, settingsOf({ budgetProfile: profile({ housing: 'family' }) }))).toBeNull()
  })

  it('maaş var, döngü hiç seçilmemiş → maaş gününde başlasın mı', () => {
    expect(bucketChip(withHousing, settingsOf({ cycleSource: undefined }))).toBe('cycle')
    expect(bucketChip(withHousing, settingsOf({ cycleSource: undefined, cycleStartDay: 10 }))).toBeNull()
  })

  it('zamlı maaş görünüyorsa güncelleme', () => {
    const raised = engine(60_000, [rent(18_000)], {})
    raised.salaryUpdateKurus = tl(72_000)
    expect(bucketChip(raised, settingsOf())).toBe('raise')
    // Döngü önerisi önce gelir
    expect(bucketChip(raised, settingsOf({ cycleSource: undefined }))).toBe('cycle')
  })
})

describe('sabit giderler penceresi: ayrıntılı kayıtla karşılanan alanlar', () => {
  it('Plus yolu (§8): kira ve fatura düzenli ödemeden, kart asgarisi ve bakiye borçtan', () => {
    const c = detailedCoverage(
      input({
        recurring: [rec({ id: 'kira', name: 'Kira', amountKurus: tl(18_000), categoryId: 'cat-kira' }), rec({ id: 'fatura', name: 'Faturalar', amountKurus: tl(3_000), categoryId: 'cat-faturalar' })],
        assets: [debtAsset({})],
        gates: PLUS,
      }),
    )
    expect(c).toEqual({
      housingKurus: { kurus: tl(18_000), from: 'payments' },
      billsKurus: { kurus: tl(3_000), from: 'payments' },
      cardPaymentKurus: { kurus: tl(4_000), from: 'debts' },
      consumerDebtKurus: { kurus: tl(20_000), from: 'debts' },
    })
  })

  it('beyan karşılanmış sayılmaz; birikim varlıktan', () => {
    const deposit = debtAsset({ id: 'mevduat', kind: 'deposit', name: 'Mevduat', debtType: undefined, debtTerms: undefined })
    const c = detailedCoverage(input({ settings: settingsOf({ budgetProfile: FREE_PROFILE }), assets: [deposit] }))
    expect(c).toEqual({ emergencyFundKurus: { kurus: tl(20_000), from: 'assets' } })
  })

  it('kredi taksiti: konut kredisi konut alanını, taşıt kredisi kredi alanını karşılar', () => {
    const mortgage = debtAsset({ id: 'konut', name: 'Konut kredisi', debtType: 'mortgage', debtTerms: { monthlyRatePct: 3, minPaymentKurus: tl(15_000) } })
    const auto = debtAsset({ id: 'tasit', name: 'Taşıt kredisi', debtType: 'auto', debtTerms: { monthlyRatePct: 0, minPaymentKurus: tl(5_000) } })
    const c = detailedCoverage(input({ assets: [mortgage, auto] }))
    expect(c.housingKurus).toEqual({ kurus: tl(15_000), from: 'debts' })
    expect(c.loanPaymentKurus).toEqual({ kurus: tl(5_000), from: 'debts' })
    expect(c.cardPaymentKurus).toBeUndefined()
    // Faizsiz taşıt kredisi faizli tüketici borcu değildir
    expect(c.consumerDebtKurus).toBeUndefined()
  })
})
