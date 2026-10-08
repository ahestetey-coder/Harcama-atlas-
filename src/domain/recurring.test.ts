import { describe, expect, it } from 'vitest'
import { budgetStatus, DEFAULT_BUDGET_PLAN } from './budget'
import { normalizeText } from './normalize'
import { addMonthsClamped, detectRecurring, groupDueToRecord, installmentName, fixedPayments, futureLoad, installmentPlans, occurrencesBetween, progressOf, plannedInstallments, upcomingPayments } from './recurring'
import type { RecurringPayment, Transaction } from './types'

let seq = 0
const tx = (date: string, lira: number, desc: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: String(++seq),
  date,
  amountKurus: Math.round(lira * 100),
  type: 'expense',
  description: desc,
  normalizedDescription: normalizeText(desc),
  categoryId: 'x',
  source: 'pdf',
  createdAt: '',
  updatedAt: '',
  ...extra,
})
const item = (o: Partial<RecurringPayment>): RecurringPayment => ({
  id: 'r1',
  name: 'Netflix',
  kind: 'subscription',
  amountKurus: 22999,
  categoryId: null,
  cadence: 'monthly',
  startDate: '2026-01-31',
  reminderDays: 3,
  active: true,
  createdAt: '',
  updatedAt: '',
  ...o,
})

describe('düzenli ödeme tarihleri', () => {
  it('ay sonu gününü kısa aylarda kırpar, sonraki ayda geri döner', () => {
    expect(addMonthsClamped('2026-01-31', 1, 31)).toBe('2026-02-28')
    expect(occurrencesBetween(item({}), '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('haftalık, yıllık ve sınırlı sayıda ödeme', () => {
    expect(occurrencesBetween(item({ cadence: 'weekly', startDate: '2026-09-01' }), '2026-09-01', '2026-09-20')).toEqual(['2026-09-01', '2026-09-08', '2026-09-15'])
    expect(occurrencesBetween(item({ cadence: 'yearly', startDate: '2024-02-29' }), '2025-01-01', '2028-12-31')).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
    const inst = item({ kind: 'installment', startDate: '2026-07-15', occurrences: 3 })
    expect(occurrencesBetween(inst, '2026-01-01', '2027-12-31')).toEqual(['2026-07-15', '2026-08-15', '2026-09-15'])
    expect(progressOf(inst, '2026-08-20')).toEqual({ paid: 2, remaining: 1 })
  })
})

describe('taksitler', () => {
  it('ad, taksit eklerinden temizlenir', () => {
    expect(installmentName('TEKNOSA ATAŞEHİR (5/12 TAKSİT)')).toBe('TEKNOSA ATAŞEHİR')
    expect(installmentName('MEDIAMARKT 6 - 1. Taksit')).toBe('MEDIAMARKT')
    expect(installmentName('IKEA 3/6')).toBe('IKEA')
  })
  const txs = [
    tx('2026-07-05', 1000, 'TEKNOSA ISTANBUL', { installment: { current: 2, total: 6 } }),
    tx('2026-08-05', 1000, 'TEKNOSA ISTANBUL', { installment: { current: 3, total: 6 } }),
    tx('2026-08-10', 500, 'IKEA', { installment: { current: 3, total: 3 } }),
  ]
  it('en son taksitten kalanları çıkarır, biten taksiti göstermez', () => {
    const plans = installmentPlans(txs)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ current: 3, total: 6, remaining: 3, remainingKurus: 300000, nextDates: ['2026-09-05', '2026-10-05', '2026-11-05'] })
  })
  it('gelecek dönem yükünü ve yaklaşan ödemeleri hesaplar', () => {
    const plans = installmentPlans(txs)
    const sub = item({ startDate: '2026-09-20' })
    const load = futureLoad([sub], plans, '2026-09', 3, 1)
    expect(load.map((l) => l.totalKurus)).toEqual([100000 + 22999, 100000 + 22999, 100000 + 22999])
    const up = upcomingPayments([sub], plans, '2026-09-04', 20)
    expect(up.map((u) => [u.date, u.remind])).toEqual([
      ['2026-09-05', true],
      ['2026-09-20', false],
    ])
  })
})

describe('düzenli ödeme önerisi', () => {
  it('her ay benzer gün ve tutardaki harcamayı önerir, marketi önermez', () => {
    const txs = [
      tx('2026-06-03', 229.99, 'NETFLIX.COM'),
      tx('2026-07-03', 229.99, 'NETFLIX.COM'),
      tx('2026-08-04', 239.99, 'NETFLIX.COM'),
      tx('2026-09-03', 239.99, 'NETFLIX.COM'),
      ...['06', '07', '08', '09'].flatMap((m) => [tx(`2026-${m}-02`, 300, 'MIGROS'), tx(`2026-${m}-12`, 450, 'MIGROS'), tx(`2026-${m}-22`, 280, 'MIGROS')]),
    ]
    const s = detectRecurring(txs, new Set(), new Set(), '2026-09-20')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ name: 'NETFLIX.COM', amountKurus: 23999, startDate: '2026-10-03', months: 4 })
    expect(detectRecurring(txs, new Set(), new Set([s[0].key]), '2026-09-20')).toHaveLength(0)
  })
})

describe('ay sonu tahmini düzenli ödemelerle', () => {
  it('kira tempoya katılmaz, kalan abonelik eklenir', () => {
    const txs = [tx('2026-09-01', 10000, 'KIRA ODEMESI'), tx('2026-09-05', 500, 'MARKET')]
    const rent = item({ id: 'k', name: 'Kira', amountKurus: 1000000, startDate: '2026-01-01', matchKey: 'KIRA ODEMESI' })
    const sub = item({ startDate: '2026-01-25' })
    const fixed = fixedPayments(txs, [rent, sub], [], '2026-09', 1, '2026-09-10')
    expect(fixed).toEqual({ fixedSpentKurus: 1000000, remainingKurus: 22999 })
    const s = budgetStatus(txs, '2026-09', 1, '2026-09-10', null, DEFAULT_BUDGET_PLAN, fixed)
    // 10.500 + 500/10×20 + 229,99
    expect(s.forecast?.projectedKurus).toBe(1050000 + 100000 + 22999)
  })
})

describe('grubun düzenli giderleri', () => {
  it('ödeme günü gelmiş ve eklenmemiş olanları verir; grupsuzları vermez', () => {
    const rent = item({ id: 'kira', name: 'Kira', groupId: 'grp-ortak', startDate: '2026-08-05', cadence: 'monthly' })
    const solo = item({ id: 'net', name: 'Netflix', startDate: '2026-08-05', cadence: 'monthly' })
    expect(groupDueToRecord([rent, solo], '2026-10-06').map((x) => [x.item.id, x.date])).toEqual([
      ['kira', '2026-09-05'],
      ['kira', '2026-10-05'],
    ])
    expect(groupDueToRecord([{ ...rent, recordedThrough: '2026-09-05' }], '2026-10-06').map((x) => x.date)).toEqual(['2026-10-05'])
    expect(groupDueToRecord([{ ...rent, recordedThrough: '2026-10-05' }], '2026-10-06')).toEqual([])
  })
})

describe('planlı taksitler', () => {
  it('ekstre taksitleri ödeme günü gelince yansır; sonraki ekstre yüklenince çakışmaz', () => {
    const real = [
      tx('2026-08-05', 500, 'TEKNOSA (3/6 TAKSİT)', {
        installment: { current: 3, total: 6 },
      }),
    ]
    const p = plannedInstallments(real, [], '2026-10-08')
    expect(p.map((t) => [t.date, t.installment?.current, t.source])).toEqual([
      ['2026-09-05', 4, 'planned'],
      ['2026-10-05', 5, 'planned'],
    ])
    // Planlı satırlarla birlikte plan ilerler: kalan 1 taksit
    expect(installmentPlans([...real, ...p])[0].remaining).toBe(1)
    // Eylül ekstresi (4/6) yüklendi: 4. taksit artık gerçek, yalnızca 5. planlı
    const next = [
      ...real,
      tx('2026-09-04', 500, 'TEKNOSA (4/6 TAKSİT)', {
        installment: { current: 4, total: 6 },
      }),
    ]
    expect(plannedInstallments(next, [], '2026-10-08').map((t) => t.installment?.current)).toEqual([5])
  })
  it('elle eklenen taksit ve borç taksiti kayıt gününden sonra yansır; aynı tutarlı gerçek ödeme varsa üretilmez', () => {
    const it1 = item({
      id: 'k',
      kind: 'installment',
      name: 'Kredi',
      amountKurus: 300000,
      startDate: '2026-08-10',
      occurrences: 12,
      createdAt: '2026-08-20T00:00:00Z',
    })
    expect(plannedInstallments([], [it1], '2026-10-08').map((t) => t.date)).toEqual(['2026-09-10'])
    expect(plannedInstallments([tx('2026-09-11', 3000, 'KREDI TAKSIT ODEMESI')], [it1], '2026-10-08')).toEqual([])
    expect(plannedInstallments([], [it1], '2026-10-10').map((t) => t.description)).toEqual(['Kredi (2/12. taksit)', 'Kredi (3/12. taksit)'])
  })
})
