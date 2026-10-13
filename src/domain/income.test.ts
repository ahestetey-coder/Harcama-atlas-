import { describe, expect, it } from 'vitest'
import { formatDate, periodOf } from './dates'
import { attributeEarlySalary, incomeBasis, incomeDates, matchIncomes, monthlyEquivalent, nextPayday, personalCycleDay, primarySalary } from './income'
import type { RecurringIncome, Transaction } from './types'

// Örnek hesap (şartname §8): bugün Pzt 12 Eki 2026, maaş her ayın 15'i → dönem 15 Eyl – 14 Eki
const TODAY = '2026-10-12'

let seq = 0
const tx = (date: string, lira: number, o: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  date,
  amountKurus: Math.round(lira * 100),
  type: 'income',
  description: 'Gelir',
  normalizedDescription: 'gelir',
  categoryId: null,
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...o,
})
const inc = (o: Partial<RecurringIncome> = {}): RecurringIncome => ({
  id: 'maas',
  name: 'Maaş',
  kind: 'salary',
  amountKurus: 6_000_000,
  cadence: 'monthly',
  startDate: '2026-09-15',
  active: true,
  createdAt: '2026-09-15T09:00:00.000Z',
  updatedAt: '',
  ...o,
})
const basis = (txs: Transaction[], incomes: RecurringIncome[], o: Partial<Parameters<typeof incomeBasis>[0]> = {}) => incomeBasis({ txs, incomes, startDay: 15, today: TODAY, journey: null, ...o })

describe('aylık karşılık', () => {
  it('haftalık × 52/12, yıllık ÷ 12, tek seferlik 0', () => {
    expect(monthlyEquivalent(100_000, 'weekly')).toBe(433_333)
    expect(monthlyEquivalent(2_400_000, 'yearly')).toBe(200_000)
    expect(monthlyEquivalent(100, 'yearly')).toBe(8)
    expect(monthlyEquivalent(2_000_000, 'once')).toBe(0)
    expect(monthlyEquivalent(6_000_000, 'monthly')).toBe(6_000_000)
  })
})

describe('gelir tarihleri', () => {
  it('tek seferlik gelir yalnızca kendi tarihinde', () => {
    const once = inc({ cadence: 'once', startDate: '2026-10-05' })
    expect(incomeDates(once, '2026-09-15', TODAY)).toEqual(['2026-10-05'])
    expect(incomeDates(once, '2026-10-06', '2027-12-31')).toEqual([])
  })
  it('aylık gelir startDate öncesine de yürür (en çok 24 ay)', () => {
    expect(incomeDates(inc(), '2026-06-01', '2026-10-31')).toEqual(['2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15'])
    expect(incomeDates(inc(), '2020-01-01', '2024-12-31')).toEqual(['2024-09-15', '2024-10-15', '2024-11-15', '2024-12-15'])
  })
  it("31'inde yatan gelir kısa aylarda ayın son günü", () => {
    const end = inc({ startDate: '2026-08-31' })
    expect(incomeDates(end, '2026-09-01', '2026-12-31')).toEqual(['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31'])
    expect(incomeDates(end, '2026-06-01', '2026-07-31')).toEqual(['2026-06-30', '2026-07-31'])
  })
  it('haftalık ve yıllık; çok eski başlangıçta da doğru haftayı bulur', () => {
    expect(incomeDates(inc({ cadence: 'weekly', startDate: '2020-01-06' }), '2026-10-01', '2026-10-31')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(incomeDates(inc({ cadence: 'yearly', startDate: '2026-09-20' }), '2020-01-01', '2027-12-31')).toEqual(['2023-09-20', '2024-09-20', '2025-09-20', '2026-09-20', '2027-09-20'])
  })
})

describe('birincil maaş ve ay döngüsü', () => {
  it('en yüksek aylık maaşı seçer; eşitse ilk ekleneni', () => {
    expect(primarySalary([inc({ id: 'a', amountKurus: 5_000_000 }), inc({ id: 'b' })])?.id).toBe('b')
    expect(primarySalary([inc({ id: 'a', createdAt: '2026-02-01T00:00:00Z' }), inc({ id: 'b', createdAt: '2025-01-01T00:00:00Z' })])?.id).toBe('b')
  })
  it('haftalık maaşı, tek seferliği, pasifi ve maaş olmayanı yok sayar', () => {
    const others = [
      inc({ id: 'h', cadence: 'weekly', amountKurus: 9_000_000 }),
      inc({ id: 't', cadence: 'once', amountKurus: 9_000_000 }),
      inc({ id: 'p', active: false, amountKurus: 9_000_000 }),
      inc({ id: 'k', kind: 'rent', amountKurus: 9_000_000 }),
    ]
    expect(primarySalary(others)).toBeNull()
    expect(primarySalary([...others, inc()])?.id).toBe('maas')
    expect(primarySalary(undefined)).toBeNull()
  })
  it('döngü günü: kaynak yoksa cycleStartDay, maaşa bağlıysa maaş günü (29–31 → 28)', () => {
    expect(personalCycleDay({ cycleStartDay: 10, recurringIncomes: [inc()] })).toBe(10)
    expect(personalCycleDay({ cycleSource: 'salary', recurringIncomes: [inc()] })).toBe(15)
    expect(personalCycleDay({ cycleSource: 'salary', recurringIncomes: [inc({ startDate: '2026-08-31' })] })).toBe(28)
    expect(personalCycleDay({ cycleSource: 'salary', cycleStartDay: 5, recurringIncomes: [] })).toBe(5)
    expect(personalCycleDay({ cycleSource: 'manual', cycleStartDay: 5, recurringIncomes: [inc()] })).toBe(5)
    expect(personalCycleDay({ cycleSource: 'manual', recurringIncomes: [inc()] })).toBe(1)
  })
})

describe('maaş günü', () => {
  it('hafta içi maaş kaymaz; hafta sonundaki önceki Cuma yatar', () => {
    expect(nextPayday(inc(), TODAY)).toEqual({ nominal: '2026-10-15', date: '2026-10-15', shifted: false })
    expect(formatDate(nextPayday(inc(), TODAY).date, 'weekday')).toBe('15 Ekim, Perşembe')
    expect(nextPayday(inc(), '2026-11-12')).toEqual({ nominal: '2026-11-15', date: '2026-11-13', shifted: true })
    expect(nextPayday(inc(), '2026-11-13')).toEqual({ nominal: '2026-11-15', date: '2026-11-13', shifted: true })
    expect(nextPayday(inc(), '2026-11-14')).toEqual({ nominal: '2026-12-15', date: '2026-12-15', shifted: false })
    expect(nextPayday(inc(), '2026-10-15').nominal).toBe('2026-10-15')
  })
})

describe('gelir eşleştirme', () => {
  const range = () => ({ from: '2026-06-05', to: TODAY })
  const one = (m: ReturnType<typeof matchIncomes>) => [...m.values()].map((x) => [x.txId, x.incomeId, x.nominal, x.raise])

  it('tutarı en yakın kayıt eşleşir', () => {
    const a = tx('2026-09-14', 55000)
    const b = tx('2026-09-16', 61000)
    expect(one(matchIncomes([a, b], [inc()], range))).toEqual([[b.id, 'maas', '2026-09-15', false]])
  })
  it('maaş diğer gelirlerden önce eşleşir', () => {
    const t = tx('2026-09-15', 65000)
    const rent = inc({ id: 'kira', kind: 'rent', name: 'Kira', amountKurus: 7_000_000 })
    expect(one(matchIncomes([t], [rent, inc()], range))).toEqual([[t.id, 'maas', '2026-09-15', false]])
    expect(one(matchIncomes([t], [rent], range))).toEqual([[t.id, 'kira', '2026-09-15', false]])
  })
  it('1,2 kat maaş zam sayılır; 2 kat (ikramiye) eşleşmez; zam yalnızca maaşta', () => {
    const r = tx('2026-09-15', 72000)
    expect(one(matchIncomes([r], [inc()], range))).toEqual([[r.id, 'maas', '2026-09-15', true]])
    expect(matchIncomes([tx('2026-09-15', 120000)], [inc()], range).size).toBe(0)
    expect(matchIncomes([r], [inc({ kind: 'other' })], range).size).toBe(0)
  })
  it('her kayıt bir kez kullanılır; planlı kayıt ve pasif tanım eşleşmez', () => {
    const t = tx('2026-09-15', 10000)
    const m = matchIncomes([t], [inc({ id: 'b', kind: 'other', amountKurus: 1_000_000 }), inc({ id: 'a', kind: 'other', amountKurus: 1_000_000 })], range)
    expect(one(m)).toEqual([[t.id, 'a', '2026-09-15', false]])
    expect(matchIncomes([tx('2026-09-15', 60000, { source: 'planned' })], [inc()], range).size).toBe(0)
    expect(matchIncomes([tx('2026-09-15', 60000)], [inc({ active: false })], range).size).toBe(0)
  })
  it('tanım eklenmeden önce girilmiş maaş geriye dönük eşleşir', () => {
    const later = inc({ startDate: '2026-10-15', createdAt: '2026-10-10T00:00:00Z' })
    const a = tx('2026-08-14', 60000)
    const b = tx('2026-09-15', 60000)
    expect(one(matchIncomes([a, b], [later], range))).toEqual([
      [a.id, 'maas', '2026-08-15', false],
      [b.id, 'maas', '2026-09-15', false],
    ])
  })
})

describe('örnek hesap (§8): gelir ve maaş günü', () => {
  it('60.000 maaş, 15 Eyl Salı başlangıç; dönem 15 Eyl – 14 Eki; sonraki maaş 15 Eki Perşembe', () => {
    const salary = inc()
    expect(formatDate(salary.startDate, 'weekday')).toBe('15 Eylül, Salı')
    const day = personalCycleDay({ cycleSource: 'salary', recurringIncomes: [salary] })
    expect(day).toBe(15)
    expect(periodOf(TODAY, day)).toBe('2026-09')
    expect(basis([], [salary])).toEqual({
      monthlyKurus: 6_000_000,
      source: 'plan',
      plannedKurus: 6_000_000,
      irregularKurus: 0,
      oneOffKurus: 0,
      reservedKurus: 0,
      upcoming: [],
      salaryUpdateKurus: null,
      confidence: 'high',
    })
    expect(nextPayday(salary, TODAY)).toEqual({ nominal: '2026-10-15', date: '2026-10-15', shifted: false })
  })
})

describe('gelir tabanı', () => {
  const weekly = inc({ id: 'ders', kind: 'other', name: 'Ders', cadence: 'weekly', amountKurus: 100_000, startDate: '2026-09-14' })
  const bonus = inc({ id: 'prim', kind: 'other', name: 'Prim', cadence: 'yearly', amountKurus: 2_400_000, startDate: '2026-09-20' })

  it('aylık + haftalık + gelmiş yıllık gelir; yıllığın 11/12si geldiği döneme ayrılır', () => {
    const b = basis([], [inc(), weekly, bonus])!
    expect(b).toMatchObject({ monthlyKurus: 6_633_333, plannedKurus: 6_633_333, source: 'plan', confidence: 'high', reservedKurus: 2_200_000, oneOffKurus: 0, upcoming: [] })
    // Sonraki dönemde ayrılan kalmaz, ÷12 tabanda kalır
    expect(basis([], [inc(), weekly, bonus], { today: '2026-10-20' })).toMatchObject({ monthlyKurus: 6_633_333, reservedKurus: 0 })
  })
  it('henüz gelmemiş yıllık gelir tabana girmez, yaklaşan gelirlerde görünür', () => {
    const later = { ...bonus, startDate: '2026-12-20' }
    expect(basis([], [inc(), weekly, later])).toMatchObject({ monthlyKurus: 6_433_333, reservedKurus: 0, upcoming: [{ id: 'prim', name: 'Prim', date: '2026-12-20', amountKurus: 2_400_000 }] })
  })
  it('örnek: Pazar 20 Eyl gelen 24.000 prim → taban 62.000, ayrılan 22.000', () => {
    expect(basis([tx('2026-09-18', 24000)], [inc(), bonus])).toMatchObject({ monthlyKurus: 6_200_000, reservedKurus: 2_200_000, oneOffKurus: 0 })
  })
  it('tek seferlik gelir: bu dönemdeyse ek gelir, ileride ise yaklaşan; taban değişmez', () => {
    const once = inc({ id: 'tek', kind: 'other', name: 'Satış', cadence: 'once', amountKurus: 2_000_000, startDate: '2026-10-05' })
    expect(basis([], [inc(), once])).toMatchObject({ monthlyKurus: 6_000_000, oneOffKurus: 2_000_000, upcoming: [] })
    // Aynı gelir ayrıca kaydedildiyse iki kez sayılmaz
    expect(basis([tx('2026-10-05', 20000)], [inc(), once])).toMatchObject({ monthlyKurus: 6_000_000, oneOffKurus: 2_000_000 })
    expect(basis([], [inc(), { ...once, startDate: '2026-11-01' }])).toMatchObject({ monthlyKurus: 6_000_000, oneOffKurus: 0, upcoming: [{ id: 'tek', date: '2026-11-01' }] })
    expect(basis([], [inc(), { ...once, startDate: '2026-09-01' }])).toMatchObject({ oneOffKurus: 0, upcoming: [] })
  })
  it('planlı satırlar yok sayılır', () => {
    const planned = [tx('2026-09-15', 60000, { source: 'planned' }), tx('2026-10-01', 30000, { source: 'planned' })]
    expect(basis(planned, [inc()])).toMatchObject({ monthlyKurus: 6_000_000, oneOffKurus: 0, irregularKurus: 0 })
    expect(basis(planned, [])).toBeNull()
  })
  it('zam: taban tanımda kalır, son maaş ipucu olarak döner', () => {
    expect(basis([tx('2026-08-14', 60000), tx('2026-09-15', 72000)], [inc()])).toMatchObject({ monthlyKurus: 6_000_000, salaryUpdateKurus: 7_200_000, oneOffKurus: 0 })
    expect(basis([tx('2026-09-15', 72000)], [inc()])).toMatchObject({ monthlyKurus: 6_000_000, salaryUpdateKurus: 7_200_000 })
    // Zamdan sonra maaş yine eski tutarda geldiyse ipucu gösterilmez
    expect(basis([tx('2026-08-14', 72000), tx('2026-09-15', 60000)], [inc()])).toMatchObject({ monthlyKurus: 6_000_000, salaryUpdateKurus: null })
  })
  it('vergi dilimiyle düşen net maaş tabanı düşürür (yalnızca son iki dönem)', () => {
    expect(basis([tx('2026-09-15', 55000)], [inc()])).toMatchObject({ monthlyKurus: 5_500_000, plannedKurus: 5_500_000, salaryUpdateKurus: null })
    expect(basis([tx('2026-08-15', 55000), tx('2026-09-15', 60000)], [inc()])).toMatchObject({ monthlyKurus: 6_000_000 })
    expect(basis([tx('2026-07-15', 55000)], [inc()])).toMatchObject({ monthlyKurus: 6_000_000 })
  })
  it('düzensiz gelir: en az 2 kayıtlı dönemin en düşüğü; gelirsiz kayıtlı dönem 0 sayılır', () => {
    const salaries = ['2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15'].map((d) => tx(d, 60000))
    const extra = [tx('2026-06-20', 30000), tx('2026-08-20', 20000)]
    expect(basis([...salaries, ...extra], [inc()])).toMatchObject({ monthlyKurus: 6_000_000, irregularKurus: 0 })
    expect(basis([...salaries, ...extra, tx('2026-07-20', 5000)], [inc()])).toMatchObject({ monthlyKurus: 6_500_000, irregularKurus: 500_000, source: 'plan' })
    // Yalnızca bir dönem kayıtlı → düzensiz gelir sayılmaz
    expect(basis([tx('2026-08-20', 20000)], [inc()])).toMatchObject({ monthlyKurus: 6_000_000, irregularKurus: 0 })
    // Gider kaydı da dönemi kayıtlı yapar
    expect(basis([tx('2026-07-20', 500, { type: 'expense' }), tx('2026-08-20', 20000)], [inc()])).toMatchObject({ irregularKurus: 0 })
  })
  it('yalnızca düzensiz gelir: kaynak kayıtlar; 3 dönem kayıtlıysa güven yüksek', () => {
    const three = [tx('2026-06-20', 30000), tx('2026-07-20', 25000), tx('2026-08-20', 20000)]
    // Haziran döneminden önce kayıt var: üç dönem de tam kayıtlı
    const early = tx('2026-06-01', 100, { type: 'expense' })
    expect(basis([early, ...three], [])).toMatchObject({ monthlyKurus: 2_000_000, source: 'records', confidence: 'high', plannedKurus: 0 })
    // İlk kayıt Haziran döneminin ortasında: o dönem sayılmaz, iki dönem kalır
    expect(basis(three, [])).toMatchObject({ monthlyKurus: 2_000_000, source: 'records', confidence: 'low' })
  })
  it('kısmen kaydedilmiş ilk dönem düzensiz geliri sıfırlamaz', () => {
    // Takvim ayı: Temmuz yalnızca 500 TL ile başladı, Ağustos ve Eylül 40.000
    const txs = [tx('2026-07-20', 500), tx('2026-08-01', 40000), tx('2026-09-01', 40000), tx('2026-10-01', 40000)]
    expect(basis(txs, [], { startDay: 1, today: '2026-10-05' })).toMatchObject({ monthlyKurus: 4_000_000, source: 'records' })
  })
  it('kayıt yedeği: bu dönemin eksik geliri geçen dönemin tam gelirinden küçükse geçen dönem esas alınır', () => {
    const txs = [tx('2026-09-15', 40000), tx('2026-10-03', 500)]
    expect(basis(txs, [], { startDay: 1, today: '2026-10-05' })).toMatchObject({ monthlyKurus: 4_000_000, source: 'records', oneOffKurus: 0 })
  })
  it('maaş tanımı güncellenince eski (düşük) maaşlar ek gelir sayılmaz', () => {
    const old = ['2026-07-15', '2026-08-15', '2026-09-15'].map((d) => tx(d, 60000))
    const raised = [...old, tx('2026-10-15', 72000)]
    const b = basis(raised, [inc({ amountKurus: 7_200_000 })], { today: '2026-10-20' })!
    expect(b).toMatchObject({ monthlyKurus: 7_200_000, irregularKurus: 0, oneOffKurus: 0, salaryUpdateKurus: null })
    // İlk kez girilen maaş 55.000; geçmişte 40.000 kaydedilmiş
    const first = ['2026-07-15', '2026-08-15', '2026-09-15'].map((d) => tx(d, 40000))
    expect(basis(first, [inc({ amountKurus: 5_500_000 })])).toMatchObject({ monthlyKurus: 5_500_000, irregularKurus: 0 })
  })
  it('bu dönemin fazla geliri = eşleşmeyen gelir − düzensiz gelir', () => {
    const salaries = ['2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15'].map((d) => tx(d, 60000))
    const extra = [tx('2026-06-20', 30000), tx('2026-07-20', 5000), tx('2026-08-20', 20000)]
    expect(basis([...salaries, ...extra, tx('2026-10-01', 12000)], [inc()])).toMatchObject({ irregularKurus: 500_000, oneOffKurus: 700_000 })
    expect(basis([...salaries, ...extra, tx('2026-10-01', 3000)], [inc()])).toMatchObject({ oneOffKurus: 0 })
    // Bugünden sonraki kayıt sayılmaz
    expect(basis([...salaries, ...extra, tx('2026-10-13', 12000)], [inc()])).toMatchObject({ oneOffKurus: 0 })
  })
  it('günü gelmemiş maaş erken yattıysa ek gelir sayılmaz', () => {
    // Takvim ayı: 15 Kas Pazar, maaş Cuma 13 Kas yattı
    expect(basis([tx('2026-11-13', 60000)], [inc()], { startDay: 1, today: '2026-11-13' })).toMatchObject({ monthlyKurus: 6_000_000, oneOffKurus: 0 })
    // Maaş günü döngüsü: kayıt 14 Kas'a kadar süren dönemde, eşleştiği maaş sonraki dönemin
    expect(basis([tx('2026-10-15', 60000), tx('2026-11-13', 60000)], [inc()], { today: '2026-11-13' })).toMatchObject({ monthlyKurus: 6_000_000, oneOffKurus: 0 })
  })
  it('tanım yoksa son dönem kayıtları taban olur (bu dönemse ek gelir sayılmaz)', () => {
    expect(basis([tx('2026-10-01', 40000)], [])).toMatchObject({ monthlyKurus: 4_000_000, source: 'records', confidence: 'low', oneOffKurus: 0 })
    expect(basis([tx('2026-09-01', 35000)], [])).toMatchObject({ monthlyKurus: 3_500_000, source: 'records', oneOffKurus: 0 })
  })
  it('Yolculuk: pasif gelir yalnızca kira geliri tanımı yoksa eklenir', () => {
    const journey = { monthlyIncomeKurus: 5_000_000, passiveIncomeKurus: 1_000_000 }
    expect(basis([], [], { journey })).toMatchObject({ monthlyKurus: 6_000_000, source: 'journey', confidence: 'low' })
    const rent = inc({ id: 'kira', kind: 'rent', name: 'Kira', amountKurus: 1_000_000, startDate: '2026-11-01' })
    expect(basis([], [rent], { journey })).toMatchObject({ monthlyKurus: 5_000_000, source: 'journey' })
    expect(basis([], [], { journey: { monthlyIncomeKurus: 5_000_000 } })).toMatchObject({ monthlyKurus: 5_000_000 })
  })
  it('hiç gelir yoksa null', () => {
    expect(basis([], [])).toBeNull()
    expect(basis([tx('2026-10-01', 500, { type: 'expense' })], [])).toBeNull()
    expect(basis([], [inc({ active: false })])).toBeNull()
  })
})

describe('erken yatan maaş', () => {
  it('Cuma 13 Kas yatan maaş 15 Kas dönemine sayılır', () => {
    const t = tx('2026-11-13', 60000)
    const r = attributeEarlySalary([t], inc(), '2026-11-13')
    expect(r.txs[0]).toMatchObject({ id: t.id, date: '2026-11-15' })
    expect(r.moved.get(t.id)).toBe('2026-11-15')
    expect(periodOf(r.txs[0].date, 15)).toBe('2026-11')
    expect(t.date).toBe('2026-11-13')
    // Zam bandındaki maaş da taşınır
    expect(attributeEarlySalary([tx('2026-11-13', 72000)], inc(), '2026-11-14').moved.size).toBe(1)
  })
  it('hafta içi maaş günü, %20 düşük tutar ve planlı kayıt taşınmaz', () => {
    const weekday = [tx('2026-10-13', 60000), tx('2026-10-15', 60000)]
    const r = attributeEarlySalary(weekday, inc(), '2026-10-15')
    expect(r.moved.size).toBe(0)
    expect(r.txs).toBe(weekday)
    expect(attributeEarlySalary([tx('2026-11-13', 48000)], inc(), '2026-11-13').moved.size).toBe(0)
    expect(attributeEarlySalary([tx('2026-11-13', 60000, { source: 'planned' })], inc(), '2026-11-13').moved.size).toBe(0)
  })
  it('bir kayıt iki kez taşınmaz; aynı haftada iki kayıttan tutarı en yakını taşınır', () => {
    const a = tx('2026-11-13', 59000)
    const b = tx('2026-11-14', 60000)
    const r = attributeEarlySalary([a, b], inc(), '2026-11-16')
    expect([...r.moved]).toEqual([[b.id, '2026-11-15']])
    expect(attributeEarlySalary(r.txs, inc(), '2026-11-16').moved.size).toBe(0)
  })
})
